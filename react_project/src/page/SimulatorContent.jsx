import { Component } from 'react'
import './../App.css'

class SimulatorContent extends Component {
  constructor(props) {
    super(props);
    const walletSnapshot = props.walletSnapshot || {};
    this.state = {
      wallet: Number(walletSnapshot.wallet || 0),
      baseWallet: Number(walletSnapshot.baseWallet || 0),
      accumulatedPrizes: Number(walletSnapshot.accumulatedPrizes || 0),
      loanAmount: Number(walletSnapshot.loanAmount || 0),
      loanUsed: Boolean(walletSnapshot.loanUsed),
      countries: [],
      quantities: {},
      openCountry: '',
      loading: true,
      borrowing: false,
      purchasing: false,
      error: '',
      message: '',
    };
  }

  componentDidMount() {
    this.loadSimulatorData();
    this.loadDashboard();
  }

  componentDidUpdate(previousProps) {
    if (previousProps.token !== this.props.token) {
      this.loadSimulatorData();
    }
  }

  componentWillUnmount() {
    this.abortController?.abort();
  }

  readResponse = async (response) => {
    const contentType = response.headers.get('content-type') || '';
    return contentType.includes('application/json') ? response.json() : null;
  }

  loadSimulatorData = async () => {
    this.abortController?.abort();
    const abortController = new AbortController();
    this.abortController = abortController;
    this.setState({
      quantities: {},
      loading: true,
      error: '',
      message: '',
    });

    try {
      const headers = this.props.token
        ? { Authorization: `Token ${this.props.token}` }
        : {};
      const response = await fetch('/api/simulator/', {
        headers,
        signal: abortController.signal,
      });
      const data = await this.readResponse(response);

      if (!response.ok) {
        throw new Error(data?.detail || `Simulator request failed (${response.status}).`);
      }
      if (!data || !Array.isArray(data.countries) || !Number.isFinite(Number(data.wallet))) {
        throw new Error('The simulator API returned invalid data.');
      }

      const walletSnapshot = {
        wallet: Number(data.wallet),
        baseWallet: Number(data.base_wallet ?? data.wallet),
        accumulatedPrizes: Number(data.prize_accumulated || 0),
        loanAmount: Number(data.loan_amount || 0),
        loanUsed: Boolean(data.loan_used),
      };
      this.setState({
        ...walletSnapshot,
        countries: data.countries,
        quantities: {},
        openCountry: '',
      });
      this.props.onWalletSnapshot?.(walletSnapshot);
    } catch (error) {
      if (error.name !== 'AbortError' && !abortController.signal.aborted) {
        this.setState({
          error: error instanceof Error ? error.message : 'Unable to load simulator data.',
        });
      }
    } finally {
      if (!abortController.signal.aborted) {
        this.setState({ loading: false });
      }
    }
  }

  loadDashboard = async () => {
    if (!this.props.token || !this.props.user?.id) {
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
      const dashboard = data.dashboard

      this.setState(
        {wallet: Number(dashboard.total_wallet) + Number(dashboard.total_prizes_won),
          baseWallet: Number(dashboard.total_wallet) + Number(dashboard.total_prizes_won),
          accumulatedPrizes: Number(dashboard.prize_accumulated),
          loanAmount: Number(dashboard.total_borrowed),
          loanUsed: Number(dashboard.borrow_count)
        })
    } catch (error) {
      this.setState({
        error: error instanceof Error ? error.message : 'Unable to load your dashboard.',
      });
    } finally {
      this.setState({ loading: false });
    }

  }

  getQuantity = (countryId, gameType) => {
    return this.state.quantities[`${countryId}-${gameType}`] || 0;
  }

  updateQuantity = (country, game, change) => {
    if (!this.props.token) {
      return;
    }

    const key = `${country.id}-${game.type}`;
    this.setState((current) => {
      const nextQuantities = {
        ...current.quantities,
        [key]: Math.max(0, (current.quantities[key] || 0) + change),
      };
      const nextTotalCents = current.countries.reduce((total, currentCountry) => (
        total + (currentCountry.games || []).reduce((countryTotal, currentGame) => (
          countryTotal +
          (nextQuantities[`${currentCountry.id}-${currentGame.type}`] || 0) *
            Math.round(Number(currentGame.price) * 100)
        ), 0)
      ), 0);
      if (change > 0 && current.wallet <= 0) {
        return current;
      }
      if (change > 0 && nextTotalCents > Math.round(current.wallet * 100)) {
        return current;
      }
      return {
        quantities: nextQuantities,
        error: '',
        message: '',
      };
    });
  }

  handleBorrow = async () => {
    if (!this.props.token || this.state.borrowing || this.state.loanUsed) {
      return;
    }

    this.setState({ borrowing: true, error: '', message: '' });
    try {
      const response = await fetch('/api/borrow/', {
        method: 'POST',
        headers: { Authorization: `Token ${this.props.token}` },
      });
      const data = await this.readResponse(response);

      if (!response.ok) {
        throw new Error(data?.detail || `Borrow request failed (${response.status}).`);
      }
      if (!data?.dashboard || !Number.isFinite(Number(data.wallet))) {
        throw new Error('The borrow API returned invalid wallet data.');
      }

      const walletSnapshot = {
        wallet: Number(data.wallet),
        baseWallet: Number(data.dashboard.total_wallet),
        accumulatedPrizes: Number(data.dashboard.prize_accumulated || 0),
        loanUsed: Boolean(data.loan_used),
        loanAmount: Number(data.loan_amount || this.state.loanAmount),
      };
      this.setState({
        ...walletSnapshot,
        message: `Borrowed ฿${Number(data.loan_amount).toLocaleString()}.`,
      });
      this.props.onWalletSnapshot?.(walletSnapshot);
    } catch (error) {
      this.setState({
        error: error instanceof Error ? error.message : 'Unable to borrow funds.',
      });
    } finally {
      this.setState({ borrowing: false });
    }
  }

  handlePurchase = async (orderLines) => {
    if (!this.props.token || this.state.purchasing) {
      return;
    }

    this.setState({ purchasing: true, error: '', message: '' });
    let purchaseSucceeded = false;
    try {
      const response = await fetch('/api/purchase/lottery/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Token ${this.props.token}`,
        },
        body: JSON.stringify({
          items: orderLines.map((line) => ({
            country_id: line.countryId,
            game_type: line.gameType,
            quantity: line.quantity,
          })),
        }),
      });
      const data = await this.readResponse(response);

      if (!response.ok) {
        throw new Error(data?.detail || `Purchase failed (${response.status}).`);
      }
      if (
        !data?.dashboard ||
        !Number.isFinite(Number(data.dashboard.total_wallet)) ||
        !Array.isArray(data.cards) ||
        !Array.isArray(data.six_tickets)
      ) {
        throw new Error('The purchase API returned invalid data.');
      }

      const updatedCountries = this.state.countries.map((country) => ({
        ...country,
        scratch_cards_available: Math.max(
          0,
          country.scratch_cards_available -
            data.cards.filter((card) => card.country_id === country.id).length,
        ),
      }));
      const walletSnapshot = {
        wallet: Number(data.dashboard.total_wallet),
        baseWallet: Number(data.dashboard.total_wallet),
        accumulatedPrizes: Number(data.dashboard.prize_accumulated || 0),
        loanAmount: this.state.loanAmount,
        loanUsed: false,
      };
      this.setState({
        ...walletSnapshot,
        countries: updatedCountries,
        quantities: {},
        purchasing: false,
        message: `Purchase complete for round ${data.round_number}.`,
      });
      this.props.onWalletSnapshot?.(walletSnapshot);
      purchaseSucceeded = true;
      this.props.gotoTickets?.();
    } catch (error) {
      this.setState({
        error: error instanceof Error ? error.message : 'Unable to complete the purchase.',
      });
    } finally {
      if (!purchaseSucceeded) {
        this.setState({ purchasing: false });
      }
    }
  }

  render() {
    const {
      wallet,
      baseWallet,
      accumulatedPrizes,
      loanAmount,
      loanUsed,
      countries,
      loading,
      borrowing,
      purchasing,
      error,
      message,
    } = this.state;
    const isAuthenticated = Boolean(this.props.user && this.props.token);
    const orderLines = countries.flatMap((country) =>
      (country.games || [])
        .filter((game) => this.getQuantity(country.id, game.type) > 0)
        .map((game) => ({
          countryId: country.id,
          country: country.name,
          gameType: game.type,
          label: `${country.name} ${game.type === 'scratch' ? 'Scratch Lottery' : game.type}`,
          quantity: this.getQuantity(country.id, game.type),
          price: Number(game.price),
        })),
    );
    const totalOrderQuantity = orderLines.reduce((sum, line) => sum + line.quantity, 0);
    const totalCost = orderLines.reduce((sum, line) => sum + line.quantity * line.price, 0);
    const totalCostCents = Math.round(totalCost * 100);
    const walletCents = Math.round(wallet * 100);
    return (
      <section className="panel simulator-panel">
        <div className="section-header">
          <h2>Lottery simulator</h2>
          <span className="status-badge">
            {isAuthenticated ? `Welcome ${this.props.user.username}` : 'Guest mode'}
          </span>
        </div>

        {!isAuthenticated && (
          <p role="status">เข้าสู่ระบบเพื่อซื้อสลากหรือยืมเงิน โดยผู้ใช้งานแบบ Guest (ไม่ได้เข้าสู่ระบบ) จะมียอดเงินคงเหลือในกระเป๋าเงินเท่ากับ ฿0</p>
        )}
        {!loading && !error && isAuthenticated && wallet <= 0 && (
          <p role="status">
            กระเป๋าเงินของคุณมียอดเงินคงเหลือเป็น 0 คุณยังสามารถเลือกดูเกมต่าง ๆ ด้านล่างได้ แต่จะไม่สามารถเพิ่มสลากลงในรายการซื้อได้
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}

        <section className="simulator-funds" aria-label="Available lottery funds">
          <div className="simulator-funds-main">
            <div>
              <p className="eyebrow">Funds available to play</p>
              <strong>฿{wallet.toLocaleString()}</strong>
            </div>
            <span className="funds-wallet-label">Virtual wallet</span>
          </div>
          <div className="simulator-funds-breakdown">
            <div>
              <span>ยอดเงินคงเหลือ</span>
              <strong>฿{baseWallet.toLocaleString()}</strong>
            </div>
            <div>
              <span>ยอดเงินกู้</span>
              <strong>฿{Math.max(wallet - baseWallet, 0).toLocaleString()}</strong>
            </div>
            <div>
              <span>ยอดเงินรางวัลสะสม</span>
              <strong>฿{accumulatedPrizes.toLocaleString()}</strong>
            </div>
          </div>
        </section>

        {loading && <p role="status">Loading simulator...</p>}
        {!loading && !error && countries.length === 0 && <p>No lottery games are configured yet.</p>}
        <div className="simulator-country-list">
          {countries.map((country) => {
            const isOpen = this.state.openCountry === country.id;
            const panelId = `simulator-${country.code || country.id}`;

            return (
              <article
                className={`simulator-country-item${isOpen ? ' expanded' : ''}`}
                key={country.id}
              >
                <button
                  className="simulator-country-tab"
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => this.setState({ openCountry: isOpen ? '' : country.id })}
                >
                  <span className="simulator-country-code">{country.code}</span>
                  <span className="simulator-country-label">
                    <strong>{country.name}</strong>
                    <small>{(country.games || []).length} lottery types</small>
                  </span>
                  <span className="guide-chevron" aria-hidden="true" />
                </button>

                {isOpen && (
                  <div className="simulator-country-content" id={panelId}>
                    <div className="simulator-game-list">
                      {(country.games || []).map((game) => {
                        const isScratch = game.type === 'scratch';
                        const quantity = this.getQuantity(country.id, game.type);
                        const price = Number(game.price);
                        const isSelectable = isAuthenticated;
                        const gameName = isScratch ? 'Scratch Lottery' : 'LOTO 6';

                        return (
                          <article className="simulator-game-card" key={game.type}>
                            <div className="simulator-game-icon" aria-hidden="true">
                              {isScratch ? '✦' : '6'}
                            </div>
                            <div className="simulator-game-info">
                              <p className="eyebrow">{isScratch ? 'Instant game' : 'Number draw'}</p>
                              <h3>{gameName}</h3>
                              <p>
                                {isScratch
                                  ? `${country.scratch_cards_available} cards available.`
                                  : 'Purchase LOTO 6 entries here, then choose six numbers on the Tickets page.'}
                              </p>
                              <span className="simulator-unit-price">
                                ฿{price.toLocaleString()} per {isScratch ? 'ticket' : 'entry'}
                              </span>
                            </div>
                            <div className="simulator-game-order">
                              <div className="counter-row">
                                <button
                                  type="button"
                                  aria-label={`Remove one ${gameName}`}
                                  disabled={!isSelectable || quantity === 0 || loading}
                                  onClick={() => this.updateQuantity(country, game, -1)}
                                >
                                  −
                                </button>
                                <strong>{quantity}</strong>
                                <button
                                  type="button"
                                  aria-label={`Add one ${gameName}`}
                                  disabled={
                                    !isSelectable ||
                                    walletCents <= 0 ||
                                    totalCostCents + Math.round(price * 100) > walletCents ||
                                    loading
                                  }
                                  onClick={() => this.updateQuantity(country, game, 1)}
                                >
                                  +
                                </button>
                              </div>
                              <span>฿{(quantity * price).toLocaleString()}</span>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>

        <section className="simulator-order-summary">
          <div className="simulator-order-header">
            <div>
              <p className="eyebrow">Your selection</p>
              <h3>สรุปรายการสั่งซื้อ</h3>
            </div>
            <span>{totalOrderQuantity} items</span>
          </div>
          <div className="simulator-order-rows">
            {orderLines.map((line) => (
              <div className="simulator-order-row" key={`${line.countryId}-${line.gameType}`}>
                <div>
                  <strong>{line.label}</strong>
                  <span>
                    {line.quantity} {line.gameType === 'scratch' ? 'tickets' : 'entries'} × ฿{line.price.toLocaleString()}
                  </span>
                </div>
                <strong>฿{(line.quantity * line.price).toLocaleString()}</strong>
              </div>
            ))}
          </div>
          <div className="simulator-order-total">
            <div>
              <span>ยอดค่าใช้จ่ายทั้งหมด</span>
              <strong>฿{totalCost.toLocaleString()}</strong>
            </div>
            <div>
              <span>ยอดเงินคงเหลือ</span>
              <strong>฿{Math.max(wallet - totalCost, 0).toLocaleString()}</strong>
            </div>
          </div>
          <div className="simulator-loan-offer">
            <div>
              <p className="eyebrow">Round loan</p>
              <span>
                {loanUsed
                  ? 'You have already borrowed for this round.'
                  : `ยืมเงิน ฿${loanAmount.toLocaleString()} สำหรับรอบนี้. โดยยอดเงินยืมจะถูกนำมาคิดเมื่อคุณดำเนินการซื้อเสร็จสมบูรณ์.`}
              </span>
            </div>
            <button
              type="button"
              disabled={!isAuthenticated || loading || borrowing || loanUsed}
              onClick={this.handleBorrow}
            >
              {!isAuthenticated
                ? 'Sign in to borrow'
                : loanUsed
                  ? 'Already borrowed'
                  : borrowing
                    ? 'Borrowing...'
                    : `Borrow ฿${loanAmount.toLocaleString()}`}
            </button>
          </div>
          <button
            className="simulator-purchase-button"
            type="button"
            disabled={
              !isAuthenticated ||
              loading ||
              borrowing ||
              purchasing ||
              totalOrderQuantity === 0 ||
              totalCost > wallet
            }
            onClick={() => this.handlePurchase(orderLines)}
          >
            {purchasing ? 'Purchasing...' : 'Proceed to purchase'}
          </button>
        </section>
      </section>
    );
  }
}

export default SimulatorContent
