import { Component } from 'react'
import './../App.css'

const activeRewardChecks = new Map()

class ResultRewardContent extends Component {
  constructor(props) {
    super(props);
    this.state = {
      summary: [],
      dailyRewards: [],
      roundNumber: null,
      openRewardCountry: '',
      loading: true,
      error: '',
      message: '',
    };
  }

  componentDidMount() {
    this.loadResults();
  }

  componentDidUpdate(previousProps) {
    if (previousProps.token !== this.props.token) {
      this.loadResults();
    }
  }

  readResponse = async (response) => {
    const contentType = response.headers.get('content-type') || '';
    return contentType.includes('application/json') ? response.json() : null;
  }

  request = async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Token ${this.props.token}`,
        ...options.headers,
      },
    });
    const data = await this.readResponse(response);
    if (!response.ok) {
      const error = new Error(data?.detail || `Request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  checkRewards = () => {
    const requestKey = `${this.props.user.id}:${this.props.token}`
    if (!activeRewardChecks.has(requestKey)) {
      const request = this.request(
        `/api/check/reward/sixlotto/${this.props.user.username}/`,
        { method: 'POST' },
      ).finally(() => {
        if (activeRewardChecks.get(requestKey) === request) {
          activeRewardChecks.delete(requestKey)
        }
      })
      activeRewardChecks.set(requestKey, request)
    }
    return activeRewardChecks.get(requestKey)
  }

  loadResults = async () => {
    if (!this.props.token || !this.props.user?.id) {
      this.setState({ loading: false, error: 'Please sign in again to view results.' });
      return;
    }
    this.setState({ loading: true, error: '', message: '' });
    let checkResult;
    let checkErrorMessage;
    try {
      try {
        checkResult = await this.checkRewards();
      } catch (error) {
        if (error.status === 400 || error.status === 409) {
          checkErrorMessage = error.message;
        } else {
          throw error;
        }
      }

      const [data, rewards] = await Promise.all([
        this.request('/api/result/summary/'),
        this.request('/api/daily/reward/sixlotto/'),
      ]);
      if (!Array.isArray(data?.summary) || !Array.isArray(rewards?.rewards)) {
        throw new Error('The result summary API returned invalid data.');
      }
      const roundNumber = data.summary.reduce(
        (latestRound, result) => Math.max(latestRound, Number(result.round_number) || 0),
        0,
      );
      const currentSummary = data.summary.filter(
        (result) => Number(result.round_number) === roundNumber,
      );
      const currentRewards = rewards.rewards.filter(
        (reward) => Number(reward.round_number) === roundNumber,
      );
      const hasCurrentLotoTickets = currentSummary.some((result) => result.ticket_type === 'loto6');
      let message;
      if (checkResult?.pending_rounds?.includes(roundNumber)) {
        message = `Save every LOTO 6 selection in round ${roundNumber} to reveal its draw.`;
      } else if (checkResult?.rounds_checked?.includes(roundNumber)) {
        message = `LOTO 6 results are ready for round ${roundNumber}.`;
      } else if (hasCurrentLotoTickets) {
        message = checkErrorMessage;
      }

      this.setState({
        summary: currentSummary,
        dailyRewards: currentRewards,
        roundNumber: roundNumber || null,
        openRewardCountry: currentRewards.length
          ? `${currentRewards[0].round_number}-${currentRewards[0].country.id}`
          : '',
        message,
      });
    } catch (error) {
      this.setState({
        error: error instanceof Error ? error.message : 'Unable to load lottery results.',
      });
    } finally {
      this.setState({ loading: false });
    }
  }

  getRewardGroups = () => {
    const countries = new Map();
    this.state.dailyRewards.forEach((reward) => {
      const key = `${reward.round_number}-${reward.country.id}`;
      if (!countries.has(key)) {
        countries.set(key, {
          ...reward.country,
          groupKey: key,
          roundNumber: reward.round_number,
          rewards: [],
        });
      }
      countries.get(key).rewards.push(reward);
    });
    return Array.from(countries.values());
  }

  render() {
    const { summary, dailyRewards, roundNumber, loading, error, message, openRewardCountry } = this.state;
    const rewardGroups = this.getRewardGroups();
    const hasLotoTickets = summary.some((result) => result.ticket_type === 'loto6');
    return (
      <section className="panel results-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Lottery results</p>
            <h2>Result reward</h2>
          </div>
          <span className="status-badge">{summary.length} orders</span>
        </div>

        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        {loading && <p role="status">Checking rewards and loading your summary...</p>}

        <section className="my-lottery-results">
          <div className="my-lottery-type-header">
            <div>
              <p className="eyebrow">Private draw · Round {roundNumber || '—'}</p>
              <h3>Your LOTO 6 rewards</h3>
            </div>
          </div>
          {dailyRewards.length === 0 ? (
            <p>
              {hasLotoTickets
                ? 'Save every LOTO 6 selection in this round to reveal its draw.'
                : 'No LOTO 6 tickets were purchased in this round.'}
            </p>
          ) : (
            <div className="my-lottery-list">
              {rewardGroups.map((country) => {
                const isOpen = openRewardCountry === country.groupKey;
                return (
                  <section className="my-lottery-country" key={country.groupKey}>
                    <button
                      className="my-lottery-country-tab"
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => this.setState({
                        openRewardCountry: isOpen ? '' : country.groupKey,
                      })}
                    >
                      <span className="my-lottery-country-code">{country.code}</span>
                      <span className="my-lottery-country-label">
                        <strong>Round {country.roundNumber} · {country.name}</strong>
                        <small>{country.rewards.length} prize rankings</small>
                      </span>
                      <span className="guide-chevron" aria-hidden="true" />
                    </button>
                    {isOpen && (
                      <div className="my-lottery-country-content">
                        <div className="reward-list">
                          {country.rewards.map((reward) => (
                            <article
                              className="reward-category"
                              key={`${country.groupKey}-${reward.ranking}`}
                            >
                              <div className="reward-header">
                                <div>
                                  <p className="eyebrow">Round {country.roundNumber} · {country.name}</p>
                                  <h4>Rank {reward.ranking}</h4>
                                </div>
                                <strong>Bonus {reward.bonus_number}</strong>
                              </div>
                              <div className="reward-numbers">
                                {reward.number_win.map((number) => (
                                  <span key={number}>{number}</span>
                                ))}
                              </div>
                            </article>
                          ))}
                        </div>
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </section>

        {!loading && summary.length === 0 ? (
          <div className="my-lottery-empty">
            <h3>No results to show yet</h3>
            <p>Purchase tickets and save your LOTO 6 numbers to see their results here.</p>
          </div>
        ) : (
          <div className="result-list">
            {summary.map((result) => (
              <article className="result-item" key={`${result.ticket_type}-${result.ticket_id}`}>
                <div>
                  <h4>
                    {result.country.name} ·{' '}
                    {result.ticket_type === 'scratch' ? 'Scratch Lottery' : 'LOTO 6'}
                  </h4>
                  <p>Round {result.round_number} · Ticket #{result.ticket_id}</p>
                  {result.ticket_type === 'loto6' && (
                    <div className="result-selected-number-block">
                      <p>Your selected numbers</p>
                      {Array.isArray(result.number_selected) && result.number_selected.length > 0 ? (
                        <div className="reward-numbers">
                          {result.number_selected.map((number) => (
                            <span key={number}>{number}</span>
                          ))}
                        </div>
                      ) : (
                        <p>Numbers have not been saved yet.</p>
                      )}
                    </div>
                  )}
                  {result.matches !== null && result.matches !== undefined && (
                    <p>
                      Matched {result.matches} numbers
                      {result.bonus_match ? ' + bonus' : ''}
                      {result.prize_rank ? ` · Rank ${result.prize_rank}` : ''}
                    </p>
                  )}
                </div>
                <div className="result-meta">
                  <span className="status-badge">
                    {result.status === 'won'
                      ? 'Winner'
                      : result.status === 'no_prize'
                        ? 'No prize'
                        : 'Pending'}
                  </span>
                  {result.prize_reward !== null && result.prize_reward !== undefined && (
                    <strong>Prize {Number(result.prize_reward).toLocaleString()}</strong>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="my-lottery-footer">
          <span>Each round has a private draw, revealed after all its LOTO 6 numbers are saved.</span>
          <button type="button" onClick={this.props.gotoTickets}>Back to tickets</button>
        </div>
      </section>
    );
  }
}

export default ResultRewardContent
