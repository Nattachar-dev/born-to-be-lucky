import { Component } from 'react'
import { apiFetch } from '../api';
import './../App.css'

const activeRewardChecks = new Map()

class ResultRewardContent extends Component {
  constructor(props) {
    super(props);
    this.state = {
      summary: [],
      dailyRewards: [],
      roundNumber: null,
      totalAmountSpentCents: 0,
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
    const response = await apiFetch(url, {
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
      if (
        !Array.isArray(data?.summary) ||
        !Number.isFinite(Number(data.total_cost)) ||
        !Array.isArray(rewards?.rewards)
      ) {
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
        totalAmountSpentCents: Math.round(Number(data.total_cost) * 100),
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

  toCents = (amount) => {
    const value = Number(amount || 0);
    return Number.isFinite(value) ? Math.round(value * 100) : 0;
  }

  formatMoney = (cents) => (cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  getEligibleRewardNumber = (matches, bonusMatch) => {
    switch (Number(matches)) {
      case 6:
        return 1;
      case 5:
        return bonusMatch ? 2 : 3;
      case 4:
        return 4;
      case 3:
        return 5;
      default:
        return null;
    }
  }

  isLotoWinner = (result) => (
    result.ticket_type === 'loto6' &&
    result.status === 'won' &&
    result.is_winner === true &&
    this.getEligibleRewardNumber(result.matches, result.bonus_match) === Number(result.prize_rank)
  )

  getTicketMatchIndicators = (result) => {
    const rewards = this.state.dailyRewards.filter((reward) => (
      Number(reward.round_number) === Number(result.round_number) &&
      reward.country.id === result.country.id
    ));
    const selectedNumbers = new Set(result.number_selected.map(Number));
    const rewardMatches = rewards
      .filter((reward) => Array.isArray(reward.number_win))
      .map((reward) => {
        const rewardNumber = Number(reward.ranking);
        const matchedNumbers = new Set(
          reward.number_win
            .map(Number)
            .filter((number) => selectedNumbers.has(number)),
        );
        return { rewardNumber, matchedNumbers };
      })
      .filter((reward) => reward.matchedNumbers.size > 0)
      .sort((left, right) => (
        right.matchedNumbers.size - left.matchedNumbers.size ||
        left.rewardNumber - right.rewardNumber
      ));
    const bestMatch = rewardMatches[0];
    const bonusNumbers = new Set(
      rewards
        .map((reward) => Number(reward.bonus_number))
        .filter(Number.isFinite),
    );
    const indicators = new Map();

    result.number_selected.forEach((number) => {
      const selectedNumber = Number(number);
      const indicator = {};
      if (bestMatch?.matchedNumbers.has(selectedNumber)) {
        indicator.rewardNumber = bestMatch.rewardNumber;
      }
      if (bonusNumbers.has(selectedNumber)) {
        indicator.isBonus = true;
      }
      if (indicator.rewardNumber || indicator.isBonus) {
        indicators.set(selectedNumber, indicator);
      }
    });

    return indicators;
  }

  render() {
    const {
      summary,
      dailyRewards,
      roundNumber,
      totalAmountSpentCents,
      loading,
      error,
      message,
      openRewardCountry,
    } = this.state;
    const rewardGroups = this.getRewardGroups();
    const hasLotoTickets = summary.some((result) => result.ticket_type === 'loto6');
    const totalRewardsWonCents = summary
      .filter((result) => Number(result.round_number) === roundNumber)
      .reduce((total, result) => total + this.toCents(result.prize_reward), 0);
    const profitLossCents = totalRewardsWonCents - totalAmountSpentCents;
    const profitLossLabel = profitLossCents > 0
      ? 'Profit'
      : profitLossCents < 0
        ? 'Loss'
        : 'Break-even';
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

        {!loading && !error && (
          <section className="result-round-summary" aria-label="Current round profit or loss">
            <div className="result-round-summary-heading">
              <p className="eyebrow">Round {roundNumber || '—'} financial summary</p>
              <h3>Profit / Loss</h3>
            </div>
            <div className="result-round-summary-values">
              <div>
                <span>Total rewards won</span>
                <strong>฿{this.formatMoney(totalRewardsWonCents)}</strong>
              </div>
              <div>
                <span>Total amount spent</span>
                <strong>฿{this.formatMoney(totalAmountSpentCents)}</strong>
              </div>
              <div className={`result-round-net${profitLossCents > 0 ? ' positive' : profitLossCents < 0 ? ' negative' : ''}`}>
                <span>{profitLossLabel}</span>
                <strong>
                  {profitLossCents < 0 ? '−' : profitLossCents > 0 ? '+' : ''}
                  ฿{this.formatMoney(Math.abs(profitLossCents))}
                </strong>
              </div>
            </div>
          </section>
        )}

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
                        <small>{country.rewards.length} rewards</small>
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
                                  <h4>Reward {reward.ranking}</h4>
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
            {summary.map((result) => {
              const isLotoWinner = this.isLotoWinner(result);
              const matchIndicators = result.ticket_type === 'loto6' &&
                Array.isArray(result.number_selected)
                ? this.getTicketMatchIndicators(result)
                : new Map();
              const isWinner = result.ticket_type === 'loto6'
                ? isLotoWinner
                : result.status === 'won';
              return (
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
                          <div className="result-selected-numbers">
                            {result.number_selected.map((number) => {
                              const indicator = matchIndicators.get(Number(number));
                              return (
                                <span
                                  className={`result-selected-number${indicator ? ' matched' : ''}`}
                                  key={number}
                                >
                                  <span className="result-selected-value">{number}</span>
                                  {indicator?.rewardNumber && (
                                    <small className="result-number-reward">
                                      Reward {indicator.rewardNumber}
                                    </small>
                                  )}
                                  {indicator?.isBonus && (
                                    <span
                                      className="result-number-bonus"
                                      role="img"
                                      aria-label="Bonus number"
                                      title="Bonus number"
                                    >
                                      ⭐
                                    </span>
                                  )}
                                </span>
                              );
                            })}
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
                        {isLotoWinner ? ` · Reward ${result.prize_rank}` : ''}
                      </p>
                    )}
                  </div>
                  <div className="result-meta">
                    <span className="status-badge">
                      {isLotoWinner && (
                        <span
                          className="result-status-trophy"
                          role="img"
                          aria-label="Winning ticket"
                          title="Winning ticket"
                        >
                          🏆
                        </span>
                      )}
                      {isWinner
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
              );
            })}
          </div>
        )}

        <div className="my-lottery-footer">
          <span>LOTTO6 - แต่ละรอบจะมีการสุ่มชุดผลรางวัลใหม่ทุกครั้ง</span>
          <button type="button" onClick={this.props.gotoTickets}>Back to tickets</button>
        </div>
      </section>
    );
  }
}

export default ResultRewardContent
