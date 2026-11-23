import React, {Component} from 'react'
import './../App.css'
import s_loto_japan from './../assets/lottery/scratch-lottery-japan.jpg'
import l_loto_japan from './../assets/lottery/lotto6-japan.jpg'
import s_loto_korea from './../assets/lottery/scratch-lottery-korea.jpg'
import l_loto_korea from './../assets/lottery/lotto6-korea.jpg'


const heroSlides = [
  {
    src: s_loto_japan,
    alt: 'japan',
  },
  {
    src: l_loto_japan,
    alt: 'japan',
  },
  {
    src: s_loto_korea,
    alt: 'korea',
  },
  {
    src: l_loto_korea,
    alt: 'korea',
  },
]

class HomeContent extends Component {
  constructor(props) {
    super(props);
    this.state = {
      page: 'home',
      currentSlide: 0,
    };
  }

  componentDidMount() {
    this.slideTimer = window.setInterval(() => {
      this.setState(({ currentSlide }) => ({
        currentSlide: (currentSlide + 1) % heroSlides.length,
      }));
    }, 5000);
  }

  componentWillUnmount() {
    window.clearInterval(this.slideTimer);
  }


  render() {
    return (
        <div>
            <section className="panel hero-panel">
            <div>
              <p className="eyebrow">Learn and simulate</p>
              <h2>Explore international lotteries</h2>
              <p>
                เปิดโลกแห่งโชคลาภ เรียนรู้ลอตเตอรี่จากทั่วโลก แล้วมาลองเสี่ยงโชคในรูปแบบจำลองไปด้วยกัน ☘
              </p>
              <div className="cta-row">
                <button type="button" onClick={this.props.gotoGuide}>
                  ลอตเตอรี่แต่ละประเทศ
                </button>
                <button type="button" className="secondary" onClick={this.props.gotoSimulator}>
                  ทดลองเล่นลอตเตอรี่
                </button>
              </div>
            </div>
            <div className="hero-visual">
              <div
                className="hero-slides"
                style={{ transform: `translateX(-${this.state.currentSlide * 100}%)` }}
                aria-live="off"
              >
                {heroSlides.map((slide, index) => (
                  <div
                    className="hero-slide"
                    key={slide.src}
                    aria-hidden={index !== this.state.currentSlide}
                  >
                    <img src={slide.src} alt={slide.alt} />
                  </div>
                ))}
              </div>
              <span>lotteries</span>
              <div className="hero-slide-indicators" aria-hidden="true">
                {heroSlides.map((slide, index) => (
                  <span
                    key={slide.src}
                    className={index === this.state.currentSlide ? 'active' : ''}
                  />
                ))}
              </div>
            </div>
            <div className="stats-grid">
              <div className="stat-card">
                <span>ประเทศที่รองรับ</span>
                <strong>Japan, South Korea</strong>
              </div>
              <div className="stat-card">
                <span>ประเภทลอตเตอรี่</span>
                <strong>2</strong>
              </div>
            </div>
            <p>"หมายเหตุ: การลุ้นรางวัลอาจสร้างความสนุกแต่ทุกการตัดสินใจมีต้นทุน เล่นอย่างมีสติ"</p>
          </section>
        </div>
    )}
}

export default HomeContent;