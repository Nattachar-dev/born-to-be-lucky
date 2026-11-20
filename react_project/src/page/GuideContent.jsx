import React, {Component} from 'react'
import './../App.css'

class GuideContent extends Component {
  constructor(props) {
    super(props);
    this.state = {
      countries: [],
      loading: true,
      error: '',
    };
  }

  async componentDidMount() {
    this.abortController = new AbortController();

    try {
      const response = await fetch('/api/guideCountries/all/', {
        signal: this.abortController.signal,
      });
      if (!response.ok) {
        throw new Error(`Guide request failed (${response.status}).`);
      }

      const data = await response.json();
      if (!Array.isArray(data.countries)) {
        throw new Error('Guide API response does not contain a countries list.');
      }

      this.setState({ countries: data.countries, loading: false });
    } catch (error) {
      if (error.name !== 'AbortError') {
        this.setState({
          error: error instanceof Error ? error.message : 'Unable to load guide data.',
          loading: false,
        });
      }
    }
  }

  componentWillUnmount() {
    this.abortController.abort();
  }

  render() {
    return (
      <div>
        <h1>Lottery guide</h1>
        {this.state.loading && <p>Loading guide data...</p>}
        {this.state.error && <p role="alert">Unable to load guide data: {this.state.error}</p>}
        {!this.state.loading && !this.state.error && this.state.countries.length === 0 && (
          <p>No guide data found.</p>
        )}
        {this.state.countries.length > 0 && (
          <ul className="guide-country-list">
            {this.state.countries.map((country) => (
              <li key={country.code}>
                <details className="guide-country-item">
                  <summary className="guide-country-summary">
                    <span className="guide-country-name">{country.name}</span>
                    <span className="guide-country-code">{country.code}</span>
                  </summary>
                  <div className="guide-country-content">
                    <div className="country-card">
                      <div>
                        <p>{country.description}</p>
                        <p>Games: {(country.available_games || []).join(', ')}</p>
                      </div>
                      <div>
                        <h3>Purchase locations</h3>
                        <ul className="bullet-list">
                          {(country.purchase_locations || []).map((location) => (
                            <li key={location}>{location}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <div className="rules-grid">
                      {country.guides.map((guide) => (
                        <article className="card-box" key={guide.id}>
                          <h3>{guide.title}</h3>
                          <p>{guide.game_description}</p>
                          <p>Ticket price: {guide.price} {country.currency}</p>
                          <h4>How to play</h4>
                          <ul className="bullet-list">
                            {guide.game_rules.map((rule, index) => (
                              <li key={`${guide.id}-rule-${index}`}>{rule}</li>
                            ))}
                          </ul>
                          <h4>Prizes</h4>
                          <ul className="bullet-list">
                            {guide.rewards.map((reward, index) => (
                              <li key={`${guide.id}-reward-${index}`}>
                                {reward.label}: {reward.prize_reward}
                              </li>
                            ))}
                          </ul>
                        </article>
                      ))}
                    </div>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }
}

export default GuideContent