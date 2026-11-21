import { Component } from 'react'
import './../App.css'

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
      this.setState({ loading: false, error: 'Please sign in again to view your dashboard.' });
      return;
    }
    this.setState({ loading: true, error: '' });
    try {
      const response = await fetch(`/api/dashboard/${this.props.user.username}/`, {
        headers: { Authorization: `Token ${this.props.token}` },
      });
      const data = await this.readResponse(response);
      if (!response.ok) {
        throw new Error(data?.detail || `Dashboard request failed (${response.status}).`);
      }
      if (!data?.dashboard || !Array.isArray(data.history)) {
        throw new Error('The dashboard API returned invalid data.');
      }
      this.setState({ dashboard: data.dashboard, history: data.history });
    } catch (error) {
      this.setState({
        error: error instanceof Error ? error.message : 'Unable to load your dashboard.',
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
            <p className="eyebrow">Your account at a glance</p>
            <h2>Player dashboard</h2>
          </div>
          {dashboard && <span className="status-badge">{dashboard.status}</span>}
        </div>

        {error && <p role="alert">{error}</p>}
        {loading && <p role="status">Loading dashboard...</p>}

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
              <small>{dashboard.borrow_count} loan requests</small>
            </article>
          </div>
        )}

        <section className="dashboard-history">
          <div className="dashboard-history-heading">
            <div>
              <p className="eyebrow">Ordered by round</p>
              <h3>Play history</h3>
            </div>
            <span className="status-badge">{history.length} rounds</span>
          </div>

          {!loading && history.length === 0 ? (
            <p className="dashboard-history-empty">No play history yet.</p>
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
                      <strong>Round {round.round_number}</strong>
                      <span>{round.date} · {round.countries.length} countries</span>
                    </div>
                    <div className="dashboard-round-totals">
                      <span>Spent ฿{this.formatMoney(round.total_cost)}</span>
                      <span>Prize ฿{this.formatMoney(round.total_prize)}</span>
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
                            <strong>{entry.country.name}</strong>
                            <span>{entry.games.join(' · ')}</span>
                          </div>
                          <small>
                            {entry.scratch_count} Scratch · {entry.six_count} LOTO 6
                          </small>
                        </div>
                        <div className="dashboard-round-ticket-list">
                          {entry.scratch_tickets.map((ticket) => (
                            <article className="dashboard-round-ticket" key={`scratch-${ticket.id}`}>
                              <div className="dashboard-round-ticket-heading">
                                <strong>Scratch #{ticket.id}</strong>
                                <span className={`dashboard-ticket-status ${ticket.status}`}>
                                  {ticket.status === 'won'
                                    ? 'Winner'
                                    : ticket.status === 'no_prize'
                                      ? 'No prize'
                                      : 'Not opened'}
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
                                    Matches: {ticket.matches} · Prize: ฿
                                    {this.formatMoney(ticket.prize_reward)}
                                  </p>
                                </>
                              ) : (
                                <p>Open this ticket to see its result.</p>
                              )}
                            </article>
                          ))}
                          {entry.six_tickets.map((ticket) => (
                            <article className="dashboard-round-ticket" key={`six-${ticket.id}`}>
                              <div className="dashboard-round-ticket-heading">
                                <strong>LOTO 6 #{ticket.id}</strong>
                                <span className={`dashboard-ticket-status ${ticket.status}`}>
                                  {ticket.status === 'won'
                                    ? 'Winner'
                                    : ticket.status === 'no_prize'
                                      ? 'No prize'
                                      : 'Pending'}
                                </span>
                              </div>
                              {Array.isArray(ticket.selected_numbers) && ticket.selected_numbers.length > 0 ? (
                                <div className="dashboard-ticket-numbers">
                                  {ticket.selected_numbers.map((number) => (
                                    <span key={number}>{number}</span>
                                  ))}
                                </div>
                              ) : (
                                <p>Numbers not saved yet.</p>
                              )}
                              {ticket.is_checked && (
                                <p>
                                  Matches: {ticket.matches}/6
                                  {ticket.bonus_match ? ' + bonus' : ''}
                                  {ticket.prize_rank ? ` · Rank ${ticket.prize_rank}` : ''}
                                  {' · '}Prize: ฿{this.formatMoney(ticket.prize_reward)}
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
