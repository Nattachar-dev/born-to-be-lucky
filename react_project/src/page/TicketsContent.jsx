import { Component, useEffect, useRef } from 'react'
import { apiFetch } from '../api';
import './../App.css'

const NUMBER_OPTIONS = Array.from({ length: 43 }, (_, index) => index + 1)

function ScratchCanvasCell({ cellIndex, symbol, scratched, disabled, onScratch }) {
  const canvasRef = useRef(null);
  const isScratching = useRef(false);
  const isComplete = useRef(false);

  useEffect(() => {
    if (scratched || disabled || !canvasRef.current) {
      return;
    }
    const canvas = canvasRef.current;
    const bounds = canvas.getBoundingClientRect();
    const pixelRatio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(bounds.width * pixelRatio));
    const height = Math.max(1, Math.round(bounds.height * pixelRatio));
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }
    context.scale(pixelRatio, pixelRatio);
    const gradient = context.createLinearGradient(0, 0, bounds.width, bounds.height);
    gradient.addColorStop(0, '#d6d1c5');
    gradient.addColorStop(0.5, '#f2eee5');
    gradient.addColorStop(1, '#c2b9a8');
    context.fillStyle = gradient;
    context.fillRect(0, 0, bounds.width, bounds.height);
    context.fillStyle = 'rgba(80, 68, 52, 0.18)';
    for (let x = 8; x < bounds.width; x += 13) {
      context.fillRect(x, 0, 1, bounds.height);
    }
    context.fillStyle = '#655643';
    context.font = '600 11px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('SCRATCH', bounds.width / 2, bounds.height / 2);
  }, [disabled, scratched]);

  const scratchAt = (event) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context || isComplete.current) {
      return;
    }
    const bounds = canvas.getBoundingClientRect();
    context.globalCompositeOperation = 'destination-out';
    context.beginPath();
    context.arc(event.clientX - bounds.left, event.clientY - bounds.top, 17, 0, Math.PI * 2);
    context.fill();
    context.globalCompositeOperation = 'source-over';

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let transparentPixels = 0;
    let sampledPixels = 0;
    for (let index = 3; index < pixels.length; index += 16) {
      sampledPixels += 1;
      if (pixels[index] < 16) {
        transparentPixels += 1;
      }
    }
    if (sampledPixels && transparentPixels / sampledPixels >= 0.46) {
      isComplete.current = true;
      onScratch();
    }
  };

  const handleKeyDown = (event) => {
    if (!scratched && !disabled && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      isComplete.current = true;
      onScratch();
    }
  };

  return (
    <div
      className={`scratch-cell${scratched ? ' scratched' : ''}${disabled ? ' disabled' : ''}`}
      role="button"
      tabIndex={scratched || disabled ? -1 : 0}
      aria-label={`Scratch cell ${cellIndex + 1}${scratched ? ', scratched' : ''}`}
      aria-pressed={scratched}
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => {
        if (scratched || disabled) {
          return;
        }
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        isScratching.current = true;
        scratchAt(event);
      }}
      onPointerMove={(event) => {
        if (isScratching.current && event.buttons === 1) {
          scratchAt(event);
        }
      }}
      onPointerUp={() => { isScratching.current = false; }}
      onPointerCancel={() => { isScratching.current = false; }}
    >
      <span className="scratch-cell-symbol">{symbol}</span>
      {!scratched && !disabled && (
        <canvas ref={canvasRef} className="scratch-overlay" aria-hidden="true" />
      )}
    </div>
  );
}

class TicketsContent extends Component {
  constructor(props) {
    super(props);
    this.state = {
      purchases: [],
      summary: [],
      openCountry: '',
      selections: {},
      scratchedCells: {},
      loading: true,
      actionId: null,
      error: '',
      message: '',
    };
  }

  componentDidMount() {
    this.loadTickets();
  }

  componentDidUpdate(previousProps) {
    if (previousProps.token !== this.props.token) {
      this.loadTickets();
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
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Token ${this.props.token}`,
        ...options.headers,
      },
    });
    const data = await this.readResponse(response);
    if (!response.ok) {
      throw new Error(data?.detail || `Request failed (${response.status}).`);
    }
    return data;
  }

  loadTickets = async () => {
    if (!this.props.token || !this.props.user?.username) {
      this.setState({ purchases: [], summary: [], loading: false });
      return;
    }
    this.setState({ loading: true, error: '' });
    try {
      const [orders, summary] = await Promise.all([
        this.request(`/api/orders/${encodeURIComponent(this.props.user.username)}/`),
        this.request('/api/result/summary/'),
      ]);
      if (!Array.isArray(orders?.purchases) || !Array.isArray(summary?.summary)) {
        throw new Error('The lottery API returned invalid data.');
      }
      this.setState({
        purchases: orders.purchases,
        summary: summary.summary,
        openCountry: orders.purchases.length
          ? String(
              orders.purchases[0].scratch_tickets[0]?.country.id ||
              orders.purchases[0].six_tickets[0]?.country.id ||
              '',
            )
          : '',
        selections: {},
        scratchedCells: {},
      });
    } catch (error) {
      this.setState({
        error: error instanceof Error ? error.message : 'Unable to load your tickets.',
      });
    } finally {
      this.setState({ loading: false });
    }
  }

  getCountryGroups = () => {
    const groups = new Map();
    const activeRound = this.state.purchases.reduce(
      (latest, purchase) => Math.max(latest, purchase.round_number),
      0,
    );
    this.state.purchases
      .filter((purchase) => purchase.round_number === activeRound)
      .forEach((purchase) => {
        [...(purchase.scratch_tickets || []), ...(purchase.six_tickets || [])].forEach((ticket) => {
          const key = String(ticket.country.id);
          if (!groups.has(key)) {
            groups.set(key, {
              id: key,
              country: ticket.country,
              scratchTickets: [],
              lotoTickets: [],
            });
          }
          const group = groups.get(key);
          const purchased = { ...ticket, roundNumber: purchase.round_number };
          if (purchase.scratch_tickets.includes(ticket)) {
            group.scratchTickets.push(purchased);
          } else {
            group.lotoTickets.push(purchased);
          }
        });
      });
    return Array.from(groups.values());
  }

  updateTicket = (ticketType, ticketId, updatedTicket) => {
    const property = ticketType === 'scratch' ? 'scratch_tickets' : 'six_tickets';
    this.setState((current) => {
      const summaryStatus = ticketType === 'scratch'
        ? updatedTicket.opened ? (updatedTicket.is_winner ? 'won' : 'no_prize') : 'pending'
        : updatedTicket.is_checked
          ? (updatedTicket.prize_rank ? 'won' : 'no_prize')
          : 'pending';
      return {
        purchases: current.purchases.map((purchase) => ({
          ...purchase,
          [property]: purchase[property].map((ticket) =>
            ticket.id === ticketId ? { ...ticket, ...updatedTicket } : ticket,
          ),
        })),
        summary: current.summary.map((item) =>
          item.ticket_type === ticketType && item.ticket_id === ticketId
            ? {
                ...item,
                status: summaryStatus,
                is_winner: summaryStatus === 'pending'
                  ? null
                  : summaryStatus === 'won',
                matches: updatedTicket.matches,
                prize_rank: updatedTicket.prize_rank,
                prize_reward: updatedTicket.prize_reward,
              }
            : item,
        ),
      };
    });
  }

  revealScratchTicket = async (ticketId) => {
    this.setState({ actionId: ticketId, error: '', message: '' });
    try {
      const data = await this.request('/api/open/scratchlotto/', {
        method: 'POST',
        body: JSON.stringify({ scratch_order_id: ticketId }),
      });
      this.updateTicket('scratch', ticketId, data.ticket);
    } catch (error) {
      this.setState({
        error: error instanceof Error ? error.message : 'Unable to open this Scratch Lottery ticket.',
      });
    } finally {
      this.setState({ actionId: null });
    }
  }

  handleScratchCell = (ticketId, cellIndex) => {
    let shouldOpenTicket = false;
    this.setState((current) => {
      const scratched = current.scratchedCells[ticketId] || [];
      if (scratched.includes(cellIndex)) {
        return current;
      }
      const nextScratched = [...scratched, cellIndex];
      shouldOpenTicket = nextScratched.length === 6;
      return {
        scratchedCells: {
          ...current.scratchedCells,
          [ticketId]: nextScratched,
        },
      };
    }, () => {
      if (shouldOpenTicket) {
        this.revealScratchTicket(ticketId);
      }
    });
  }

  getSelectedNumbers = (ticket) => {
    return this.state.selections[ticket.id] || ticket.selected || [];
  }

  toggleLotoNumber = (ticket, number) => {
    if (ticket.is_saved || ticket.is_checked) {
      return;
    }
    this.setState((current) => {
      const selected = current.selections[ticket.id] || ticket.selected || [];
      const next = selected.includes(number)
        ? selected.filter((item) => item !== number)
        : selected.length < 6
          ? [...selected, number].sort((a, b) => a - b)
          : selected;
      return {
        selections: { ...current.selections, [ticket.id]: next },
        error: '',
        message: '',
      };
    });
  }

  saveLotoEntry = async (ticket) => {
    this.setState({ actionId: ticket.id, error: '', message: '' });
    try {
      const data = await this.request('/api/save/sixlotto/', {
        method: 'POST',
        body: JSON.stringify({
          six_order_id: ticket.id,
          number_selected: this.getSelectedNumbers(ticket),
        }),
      });
      this.updateTicket('loto6', ticket.id, data.ticket);
      this.setState({ message: 'Your LOTO 6 numbers have been saved.' });
    } catch (error) {
      this.setState({
        error: error instanceof Error ? error.message : 'Unable to save your number selection.',
      });
    } finally {
      this.setState({ actionId: null });
    }
  }

  getSummary = (type, ticketId) => {
    return this.state.summary.find(
      (item) => item.ticket_type === type && item.ticket_id === ticketId,
    );
  }

  render() {
    const { loading, error, message, actionId } = this.state;
    const groups = this.getCountryGroups();
    const activeRound = this.state.purchases.reduce(
      (latest, purchase) => Math.max(latest, purchase.round_number),
      0,
    );
    const scratchCount = groups.reduce((count, group) => count + group.scratchTickets.length, 0);
    const lotoTickets = groups.flatMap((group) => group.lotoTickets);
    const hasUnsavedLotoTickets = lotoTickets.some((ticket) => !ticket.is_saved);
    const hasPendingLotoTickets = lotoTickets.some((ticket) => ticket.is_saved && !ticket.is_checked);

    return (
      <section className="panel tickets-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Your collection</p>
            <h2>My lottery</h2>
          </div>
          <span className="status-badge">
            {activeRound ? `Round ${activeRound} · ` : ''}{scratchCount + lotoTickets.length} tickets
          </span>
        </div>

        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        {loading && <p role="status">Loading your tickets...</p>}

        {!loading && groups.length === 0 ? (
          <div className="my-lottery-empty">
            <h3>No lottery tickets yet</h3>
            <p>Choose a country and lottery type in the simulator to get started.</p>
            <button type="button" onClick={this.props.gotoSimulator}>Go to simulator</button>
          </div>
        ) : (
          <div className="my-lottery-list">
            {groups.map((group) => (
              <section className="my-lottery-country" key={group.id}>
                <button
                  className="my-lottery-country-tab"
                  type="button"
                  aria-expanded={this.state.openCountry === group.id}
                  onClick={() => this.setState({
                    openCountry: this.state.openCountry === group.id ? '' : group.id,
                  })}
                >
                  <span className="my-lottery-country-code">{group.country.code}</span>
                  <span className="my-lottery-country-label">
                    <strong>{group.country.name}</strong>
                    <small>
                      {group.scratchTickets.length + group.lotoTickets.length} tickets ·{' '}
                      {group.scratchTickets.length} Scratch · {group.lotoTickets.length} LOTO 6
                    </small>
                  </span>
                  <span className="guide-chevron" aria-hidden="true" />
                </button>

                {this.state.openCountry === group.id && (
                  <div className="my-lottery-country-content">
                    {group.scratchTickets.length > 0 && (
                      <section className="my-lottery-type">
                        <div className="my-lottery-type-header">
                          <h4>Scratch Lottery</h4>
                          <span>{group.scratchTickets.length} tickets</span>
                        </div>
                        <div className="ticket-list">
                          {group.scratchTickets.map((ticket, index) => {
                            const summary = this.getSummary('scratch', ticket.id);
                            return (
                              <article className="ticket-card" key={ticket.id}>
                                <div className="ticket-label-row">
                                  <div>
                                    <span>Round {ticket.roundNumber} · Ticket {index + 1}</span>
                                    <h3>{ticket.card_code}</h3>
                                  </div>
                                  <span className="status-badge">
                                    {ticket.opened
                                      ? ticket.is_winner ? 'Winner' : 'No prize'
                                      : summary?.status === 'won' ? 'Winner' : 'Unopened'}
                                  </span>
                                </div>
                                <div className="scratch-ticket-layout">
                                  <div className="scratch-cell-grid" aria-label="Scratch six cells to reveal">
                                    {(ticket.symbols || Array(6).fill('?')).map((symbol, cellIndex) => (
                                      ticket.opened ? (
                                        <div className="scratch-cell revealed" key={`${ticket.id}-${cellIndex}`}>
                                          <span className="scratch-cell-symbol">{symbol}</span>
                                        </div>
                                      ) : (
                                        <ScratchCanvasCell
                                          key={`${ticket.id}-${cellIndex}`}
                                          cellIndex={cellIndex}
                                          symbol={symbol}
                                          scratched={(this.state.scratchedCells[ticket.id] || []).includes(cellIndex)}
                                          disabled={actionId === ticket.id}
                                          onScratch={() => this.handleScratchCell(ticket.id, cellIndex)}
                                        />
                                      )
                                    ))}
                                  </div>
                                  <aside className="scratch-target-panel">
                                    <span className="eyebrow">Match symbols</span>
                                    <div className="scratch-target-symbols">
                                      {(ticket.target_symbols || []).map((symbol, symbolIndex) => (
                                        <span key={`${ticket.id}-target-${symbolIndex}`}>{symbol}</span>
                                      ))}
                                    </div>
                                    <small>Scratch all six panels to reveal the symbols.</small>
                                  </aside>
                                </div>
                                {!ticket.opened && (this.state.scratchedCells[ticket.id] || []).length === 6 && (
                                  <button
                                    type="button"
                                    disabled={actionId === ticket.id}
                                    onClick={() => this.revealScratchTicket(ticket.id)}
                                  >
                                    {actionId === ticket.id ? 'Opening...' : 'Reveal result'}
                                  </button>
                                )}
                                {ticket.opened && (
                                  <p className="ticket-outcome">
                                    {ticket.matches} matches · Prize {ticket.prize_reward} ·{' '}
                                    {ticket.target_symbols.length
                                      ? `Match ${ticket.target_symbols.join(' ')}`
                                      : 'No matching symbols'}
                                  </p>
                                )}
                              </article>
                            );
                          })}
                        </div>
                      </section>
                    )}

                    {group.lotoTickets.length > 0 && (
                      <section className="my-lottery-type">
                        <div className="my-lottery-type-header">
                          <h4>LOTO 6</h4>
                          <span>{group.lotoTickets.length} entries</span>
                        </div>
                        <div className="ticket-list">
                          {group.lotoTickets.map((ticket, index) => {
                            const selected = this.getSelectedNumbers(ticket);
                            const summary = this.getSummary('loto6', ticket.id);
                            return (
                              <article className="ticket-card" key={ticket.id}>
                                <div className="ticket-label-row">
                                  <div>
                                    <span>Round {ticket.roundNumber} · Entry {index + 1}</span>
                                    <h3>{ticket.is_saved ? 'Numbers saved' : `${selected.length}/6 selected`}</h3>
                                  </div>
                                  <span className="status-badge">
                                    {ticket.is_checked
                                      ? ticket.prize_rank ? 'Winner' : 'No prize'
                                      : summary?.status === 'won'
                                        ? 'Winner'
                                        : ticket.is_saved ? 'Waiting for draw' : 'Choose numbers'}
                                  </span>
                                </div>
                                <div className="number-grid">
                                  {NUMBER_OPTIONS.map((number) => (
                                    <button
                                      key={number}
                                      type="button"
                                      className={selected.includes(number) ? 'selected' : ''}
                                      aria-pressed={selected.includes(number)}
                                      disabled={ticket.is_saved || ticket.is_checked}
                                      onClick={() => this.toggleLotoNumber(ticket, number)}
                                    >
                                      {number}
                                    </button>
                                  ))}
                                </div>
                                {ticket.is_checked && (
                                  <p className="ticket-outcome">
                                    Matched {ticket.matches} numbers
                                    {ticket.bonus_match ? ' + bonus' : ''} ·{' '}
                                    {ticket.prize_rank ? `Rank ${ticket.prize_rank}` : 'No prize'} ·{' '}
                                    Prize {ticket.prize_reward}
                                  </p>
                                )}
                                <button
                                  className='basic-button'
                                  type="button"
                                  disabled={selected.length !== 6 || ticket.is_saved || actionId === ticket.id}
                                  onClick={() => this.saveLotoEntry(ticket)}
                                >
                                  {actionId === ticket.id
                                    ? 'Saving...'
                                    : ticket.is_saved ? 'Numbers saved' : 'Save number selection'}
                                </button>
                              </article>
                            );
                          })}
                        </div>
                      </section>
                    )}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}

        <div className="my-lottery-footer">
          <p>
            {hasUnsavedLotoTickets
              ? 'Save all LOTO 6 number selections before viewing the result summary.'
              : hasPendingLotoTickets
                ? `${lotoTickets.filter((ticket) => ticket.is_saved && !ticket.is_checked).length} saved entries are ready for a draw.`
                : lotoTickets.length
                  ? 'All saved LOTO 6 entries have been checked.'
                  : 'Number-draw results will appear here after you purchase an entry.'}
          </p>
          {this.props.gotoResultReward && (
            <button type="button" onClick={this.props.gotoResultReward}>View result summary</button>
          )}
        </div>
      </section>
    )
  }
}

export default TicketsContent
