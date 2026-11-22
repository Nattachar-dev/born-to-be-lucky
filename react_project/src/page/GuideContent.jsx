import React, {Component} from 'react'
import { apiFetch } from '../api';
import './../App.css'
import { thaiCountryName, thaiErrorMessage, thaiGuideText } from '../utils/thai'

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
      const response = await apiFetch('/api/guideCountries/all/', {
        signal: this.abortController.signal,
      });
      if (!response.ok) {
        throw new Error(`โหลดคู่มือไม่สำเร็จ (รหัส ${response.status})`);
      }

      const data = await response.json();
      if (!Array.isArray(data.countries)) {
        throw new Error('ข้อมูลคู่มือไม่มีรายการประเทศ');
      }

      this.setState({ countries: data.countries, loading: false });
    } catch (error) {
      if (error.name !== 'AbortError') {
        this.setState({
          error: thaiErrorMessage(error, 'ไม่สามารถโหลดข้อมูลคู่มือได้ โปรดลองอีกครั้ง'),
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
        <h1>คู่มือสลาก</h1>
        {this.state.loading && <p>กำลังโหลดข้อมูลคู่มือ...</p>}
        {this.state.error && <p role="alert">{this.state.error}</p>}
        {!this.state.loading && !this.state.error && this.state.countries.length === 0 && (
          <p>ไม่พบข้อมูลคู่มือ</p>
        )}
        {this.state.countries.length > 0 && (
          <ul className="guide-country-list">
            {this.state.countries.map((country) => (
              <li key={country.code}>
                <details className="guide-country-item">
                  <summary className="guide-country-summary">
                    <span className="guide-country-name">{thaiCountryName(country.name)}</span>
                    <span className="guide-country-code">{country.code}</span>
                  </summary>
                  <div className="guide-country-content">
                    <div className="country-card">
                      <div>
                        <p>{thaiGuideText(country.description)}</p>
                        <p>เกมที่มีให้เลือก: {(country.available_games || []).map(thaiGuideText).join(', ')}</p>
                      </div>
                      <div>
                        <h3>สถานที่จำหน่าย</h3>
                        <ul className="bullet-list">
                          {(country.purchase_locations || []).map((location) => (
                            <li key={location}>{thaiGuideText(location)}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <div className="rules-grid">
                      {country.guides.map((guide) => (
                        <article className="card-box" key={guide.id}>
                          <h3>{thaiGuideText(guide.title)}</h3>
                          <p>{thaiGuideText(guide.game_description)}</p>
                          <p>ราคาสลาก: {guide.price} {country.currency}</p>
                          <h4>วิธีเล่น</h4>
                          <ul className="bullet-list">
                            {guide.game_rules.map((rule, index) => (
                              <li key={`${guide.id}-rule-${index}`}>{thaiGuideText(rule)}</li>
                            ))}
                          </ul>
                          <h4>เงินรางวัล</h4>
                          <ul className="bullet-list">
                            {guide.rewards.map((reward, index) => (
                              <li key={`${guide.id}-reward-${index}`}>
                                {thaiGuideText(reward.label)}: {thaiGuideText(reward.prize_reward)}
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