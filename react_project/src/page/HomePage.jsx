import {Component} from 'react'
import './../App.css'
import LoginContent from './LoginContent'
import HomeContent from './HomeContent'
import GuideContent from './GuideContent'
import SimulatorContent from './SimulatorContent'
import TicketsContent from './TicketsContent'
import DashboardContent from './DashboardContent'
import ResultRewardContent from './ResultRewardContent'
import AdminContent from './AdminContent'
import { thaiErrorMessage } from '../utils/thai'



class HomePage extends Component {
  constructor(props) {
    super(props);
    this.state = {
      page: props.initialPage || 'home',
      user: null,
      token: '',
      walletSnapshot: null,
      authError: '',
      authLoading: false,
    };
  }

  handleLogin = ({ id, username, token, isStaff }) => {
    this.setState({ user: { id, username, isStaff }, token, walletSnapshot: null, authError: '' });
  }

  handleWalletSnapshot = (walletSnapshot) => {
    this.setState({ walletSnapshot });
  }

  handleLogout = async () => {
    this.setState({ authLoading: true, authError: '' });

    try {
      const response = await fetch('/api/auth/logout/', {
        method: 'POST',
        headers: { Authorization: `Token ${this.state.token}` },
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type') || '';
        const data = contentType.includes('application/json')
          ? await response.json()
          : null;
        throw new Error(data?.detail || `ออกจากระบบไม่สำเร็จ (รหัส ${response.status})`);
      }

      this.setState({
        page: 'login',
        user: null,
        token: '',
        walletSnapshot: null,
      });
    } catch (error) {
      this.setState({
        authError: thaiErrorMessage(error, 'ไม่สามารถออกจากระบบได้ โปรดลองอีกครั้ง'),
      });
    } finally {
      this.setState({ authLoading: false });
    }
  }

  gotoGuide = () => {
    this.setState({ page: 'guide' });
  }

  gotoSimulator = () => {
    this.setState({ page: 'simulator' });
  }

  gotoTickets = () => {
    this.setState({ page: 'tickets' });
  }

  gotoResultReward = () => {
    this.setState({ page: 'ResultRewardContent' });
  }

  render() {
    const { page, user, authError, authLoading } = this.state;
    const navItems = ['home', 'guide', 'simulator'];
    const navLabels = {
      home: 'หน้าหลัก',
      guide: 'คู่มือสลาก',
      simulator: 'จำลองการซื้อ',
      tickets: 'สลากของฉัน',
      dashboard: 'แดชบอร์ด',
      admin: 'ผู้ดูแลระบบ',
    };
    if (user) {
      navItems.push('tickets', 'dashboard');
    }
    if (user?.isStaff) {
      navItems.push('admin');
    }

    return (
       <div className={`app-shell${page === 'home' ? '' : ' app-shell-thai'}`}>
          <header className="topbar">
            <div className="brand-lockup">
              <div className="brand-mark" aria-hidden="true">B</div>
              <div>
                <p className="eyebrow">{page === 'home' ? 'lottery journal' : 'บันทึกสลาก'}</p>
                <h1>Born to Be Lucky</h1>
              </div>
            </div>
            <nav className="nav">
              {navItems.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={page === item ? 'active' : ''}
                  onClick={() => this.setState({ page: item })}
                >
                  {page === 'home' ? item : navLabels[item]}
                </button>
              ))}
            </nav>
            <div className="login-box">
              {user ? (
                <>
                  <button type="button" onClick={this.handleLogout} disabled={authLoading}>
                    {authLoading
                      ? page === 'home' ? 'Logging out...' : 'กำลังออกจากระบบ...'
                      : page === 'home' ? 'Logout' : 'ออกจากระบบ'}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className={page === 'login' ? 'active' : ''}
                  onClick={() => this.setState({ page: 'login' })}
                >
                  {page === 'home' ? 'Login' : 'เข้าสู่ระบบ'}
                </button>
              )}
            </div>
          </header>
          <main className="content">
            {authError && <p role="alert">{authError}</p>}
            {page === 'home' && <HomeContent gotoGuide={this.gotoGuide} gotoSimulator={this.gotoSimulator} />}
            {page === 'login' && (
              <LoginContent
                user={user}
                onLogin={this.handleLogin}
                onLogout={this.handleLogout}
                authLoading={authLoading}
              />
            )}
            {page === 'guide' && <GuideContent />}
            {page === 'simulator' && (
              <SimulatorContent
                user={user}
                token={this.state.token}
                walletSnapshot={this.state.walletSnapshot}
                onWalletSnapshot={this.handleWalletSnapshot}
                gotoTickets={this.gotoTickets}
              />
            )}
            {page === 'tickets' && user && (
              <TicketsContent
                user={user}
                token={this.state.token}
                gotoSimulator={this.gotoSimulator}
                gotoResultReward={this.gotoResultReward}
              />
            )}
            {page === 'dashboard' && user && (
              <DashboardContent user={user} token={this.state.token} />
            )}
            {page === 'admin' && user?.isStaff && (
              <AdminContent user={user} token={this.state.token} />
            )}
            {page === 'ResultRewardContent' && user && (
              <ResultRewardContent
                user={user}
                token={this.state.token}
                gotoTickets={this.gotoTickets}
              />
            )}
          </main>
      </div>
    );
  }
}

export default HomePage