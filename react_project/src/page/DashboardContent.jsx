import { Component } from 'react'
import { apiFetch } from '../api';
import './../App.css'
import { thaiCountryName, thaiErrorMessage, thaiGameName } from '../utils/thai'

class DashboardContent extends Component {
  constructor(props) {
    super(props);
    this.state = {
      dashboard: null,
      history: [],
      expandedRounds: {},
      loading: true,
      error: '',
    };
  }

  componentDidMount() {
    this.loadDashboard();
  }

  componentDidUpdate(previousProps) {
    if (previousProps.token !== this.props.token || previousProps.user?.id !== this.props.user?.id) {
      this.loadDashboard();
    }
  }

  readResponse = async (response) => {
    const contentType = response.headers.get('content-type') || '';
    return contentType.includes('application/json') ? response.json() : null;
  }

  loadDashboard = async () => {
    if (!this.props.token || !this.props.user?.id) {
      this.setState({ loading: false, error: 'กรุณาเข้าสู่ระบบอีกครั้งเพื่อดูแดชบอร์ด' });
      return;
    }
    this.setState({ loading: true, error: '' });
    try {
      const response = await apiFetch(`/api/dashboard/${this.props.user.username}/`, {
        headers: { Authorization: `Token ${this.props.token}` },
      });
      const data = await this.readResponse(response);
      if (!response.ok) {
        throw new Error(data?.detail || `โหลดแดชบอร์ดไม่สำเร็จ (รหัส ${response.status})`);
      }
      if (!data?.dashboard || !Array.isArray(data.history)) {
        throw new Error('ข้อมูลแดชบอร์ดที่ได้รับไม่ถูกต้อง');
      }
      this.setState({ dashboard: data.dashboard, history: data.history });
    } catch (error) {
      this.setState({
        error: thaiErrorMessage(error, 'ไม่สามารถโหลดแดชบอร์ดได้ โปรดลองอีกครั้ง'),
      });
    } finally {
      this.setState({ loading: false });
    }
  }

  formatMoney = (value) => Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  toggleRound = (roundNumber) => {
    this.setState((current) => ({
      expandedRounds: {
        ...current.expandedRounds,
        [roundNumber]: !current.expandedRounds[roundNumber],
      },
    }));
  }

  render() {
    const { dashboard, history, loading, error } = this.state;
    return (
      <section className="panel dashboard-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">ภาพรวมบัญชีของคุณ</p>
            <h2>แดชบอร์ดผู้เล่น</h2>
          </div>
          {dashboard && (
            <span className="status-badge">
              {{ profit: 'กำไร', loss: 'ขาดทุน', normal: 'ปกติ' }[dashboard.status] || dashboard.status}
            </span>
          )}
        </div>

        {error && <p role="alert">{error}</p>}
        {loading && <p role="status">กำลังโหลดแดชบอร์ด...</p>}

        {dashboard && (
          <div className="stats-grid dashboard-grid">
            <article className="stat-card">
              <span>จำนวนรอบที่เล่น</span>
              <strong>{dashboard.rounds_played.toLocaleString()}</strong>
            </article>
            <article className="stat-card">
              <span>ยอดเงินคงเหลือ</span>
              <strong>฿{this.formatMoney(dashboard.total_wallet)}</strong>
            </article>
            <article className="stat-card">
              <span>ยอดเงินรางวัลสะสม</span>
              <strong>฿{this.formatMoney(dashboard.prize_accumulated)}</strong>
            </article>
            <article className={`stat-card dashboard-profit${Number(dashboard.net_profit_or_loss) >= 0 ? ' positive' : ' negative'}`}>
              <span>กำไร / ขาดทุน</span>
              <strong>
                {Number(dashboard.net_profit_or_loss) >= 0 ? '+' : '−'}฿
                {this.formatMoney(Math.abs(Number(dashboard.net_profit_or_loss)))}
              </strong>
            </article>
            <article className="stat-card">
              <span>ยอดเงินยืมสะสม</span>
              <strong>฿{this.formatMoney(dashboard.total_borrowed)}</strong>
              <small>คำขอยืมเงิน {dashboard.borrow_count} ครั้ง</small>
            </article>
          </div>
        )}

        <section className="dashboard-history">
          <div className="dashboard-history-heading">
            <div>
              <p className="eyebrow">เรียงตามรอบ</p>
              <h3>ประวัติการเล่น</h3>
            </div>
            <span className="status-badge">{history.length} รอบ</span>
          </div>

          {!loading && history.length === 0 ? (
            <p className="dashboard-history-empty">ยังไม่มีประวัติการเล่น</p>
          ) : (
            <div className="dashboard-history-list">
              {history.map((round) => (
                <article className="dashboard-round-card" key={round.round_number}>
                  <button
                    className="dashboard-round-header"
                    type="button"
                    aria-expanded={Boolean(this.state.expandedRounds[round.round_number])}
                    aria-controls={`dashboard-round-${round.round_number}`}
                    onClick={() => this.toggleRound(round.round_number)}
                  >
                    <div>
                      <strong>รอบที่ {round.round_number}</strong>
                      <span>{round.date} · {round.countries.length} ประเทศ</span>
                    </div>
                    <div className="dashboard-round-totals">
                      <span>ใช้ไป ฿{this.formatMoney(round.total_cost)}</span>
                      <span>รางวัล ฿{this.formatMoney(round.total_prize)}</span>
                      <strong className={Number(round.net_result) >= 0 ? 'positive' : 'negative'}>
                        {Number(round.net_result) >= 0 ? '+' : '−'}฿
                        {this.formatMoney(Math.abs(Number(round.net_result)))}
                      </strong>
                    </div>
                    <span className="dashboard-round-toggle" aria-hidden="true">
                      {this.state.expandedRounds[round.round_number] ? '−' : '+'}
                    </span>
                  </button>
                  <div
                    className="dashboard-round-details"
                    id={`dashboard-round-${round.round_number}`}
                    hidden={!this.state.expandedRounds[round.round_number]}
                  >
                    {round.countries.map((entry) => (
                      <section className="dashboard-round-country-group" key={`${round.round_number}-${entry.country.id}`}>
                        <div className="dashboard-round-country">
                          <div>
                            <strong>{thaiCountryName(entry.country.name)}</strong>
                            <span>{entry.games.map(thaiGameName).join(' · ')}</span>
                          </div>
                          <small>
                            สลากขูด {entry.scratch_count} · ล็อตโต้ 6 {entry.six_count}
                          </small>
                        </div>
                        <div className="dashboard-round-ticket-list">
                          {entry.scratch_tickets.map((ticket) => (
                            <article className="dashboard-round-ticket" key={`scratch-${ticket.id}`}>
                              <div className="dashboard-round-ticket-heading">
                                <strong>สลากขูด #{ticket.id}</strong>
                                <span className={`dashboard-ticket-status ${ticket.status}`}>
                                  {ticket.status === 'won'
                                    ? 'ถูกรางวัล'
                                    : ticket.status === 'no_prize'
                                      ? 'ไม่ถูกรางวัล'
                                      : 'ยังไม่เปิด'}
                                </span>
                              </div>
                              {ticket.opened ? (
                                <>
                                  <div className="dashboard-ticket-symbols">
                                    {(Array.isArray(ticket.symbols) ? ticket.symbols : []).map((symbol, index) => (
                                      <span key={`${ticket.id}-${index}`}>{symbol}</span>
                                    ))}
                                  </div>
                                  <p>
                                    จับคู่ได้ {ticket.matches} · รางวัล: ฿
                                    {this.formatMoney(ticket.prize_reward)}
                                  </p>
                                </>
                              ) : (
                                <p>เปิดสลากใบนี้เพื่อดูผล</p>
                              )}
                            </article>
                          ))}
                          {entry.six_tickets.map((ticket) => (
                            <article className="dashboard-round-ticket" key={`six-${ticket.id}`}>
                              <div className="dashboard-round-ticket-heading">
                                <strong>ล็อตโต้ 6 #{ticket.id}</strong>
                                <span className={`dashboard-ticket-status ${ticket.status}`}>
                                  {ticket.status === 'won'
                                    ? 'ถูกรางวัล'
                                    : ticket.status === 'no_prize'
                                      ? 'ไม่ถูกรางวัล'
                                      : 'รอผล'}
                                </span>
                              </div>
                              {Array.isArray(ticket.selected_numbers) && ticket.selected_numbers.length > 0 ? (
                                <div className="dashboard-ticket-numbers">
                                  {ticket.selected_numbers.map((number) => (
                                    <span key={number}>{number}</span>
                                  ))}
                                </div>
                              ) : (
                                <p>ยังไม่ได้บันทึกตัวเลข</p>
                              )}
                              {ticket.is_checked && (
                                <p>
                                  จับคู่ได้ {ticket.matches}/6
                                  {ticket.bonus_match ? ' + โบนัส' : ''}
                                  {ticket.prize_rank ? ` · รางวัลที่ ${ticket.prize_rank}` : ''}
                                  {' · '}เงินรางวัล: ฿{this.formatMoney(ticket.prize_reward)}
                                </p>
                              )}
                            </article>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    );
  }
}

export default DashboardContent
