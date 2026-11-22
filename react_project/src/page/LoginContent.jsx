import { Component } from 'react'
import { apiFetch } from '../api';
import './../App.css'
import l_loto_korea from './../assets/lottery/login.jpg'

class LoginContent extends Component {
  constructor(props) {
    super(props);
    this.state = {
      mode: 'login',
      form: {
        username: '',
        password: '',
      },
      message: '',
      error: '',
      loading: false,
    };
  }

  handleSubmit = async (event) => {
    event.preventDefault();
    this.setState({ loading: true, error: '', message: '' });

    try {
      const isRegistering = this.state.mode === 'register';
      const response = await apiFetch(
        isRegistering ? '/api/createuser/' : '/api/auth/login/',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.state.form),
        },
      );
      const contentType = response.headers.get('content-type') || '';
      const data = contentType.includes('application/json')
        ? await response.json()
        : null;

      if (!response.ok) {
        throw new Error(data?.detail || `คำขอไม่สำเร็จ (รหัส ${response.status})`);
      }
      if (!data) {
        throw new Error('เซิร์ฟเวอร์ส่งข้อมูลตอบกลับไม่ถูกต้อง');
      }

      if (isRegistering) {
        this.setState({
          mode: 'login',
          message: 'สร้างบัญชีเรียบร้อยแล้ว กรุณาเข้าสู่ระบบ',
        });
      } else {
        if (!data.username || !data.token || typeof data.is_staff !== 'boolean') {
          throw new Error('ข้อมูลบัญชีจากการเข้าสู่ระบบไม่ครบถ้วน');
        }
        this.props.onLogin({
          id: data.id,
          username: data.username,
          token: data.token,
          isStaff: data.is_staff,
        });
      }
    } catch (error) {
      this.setState({
        error: error,
      });
    } finally {
      this.setState({ loading: false });
    }
  }

  handleModeChange = (mode) => {
    this.setState({ mode, error: '', message: '' });
  }

  handleFieldChange = (event) => {
    const { name, value } = event.target;
    this.setState((current) => ({
      form: { ...current.form, [name]: value },
    }));
  }

  render() {
    const { mode, form, message, error, loading } = this.state;
    const { user, authLoading, onLogout } = this.props;
    const isRegistering = mode === 'register';

    return (
      <section className="panel form-panel">
        <h2>{user ? 'โชคดี ☘' : isRegistering ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'}</h2>
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        {user ? (
          <div className="login-success">
            <h2>ยินดีต้อนรับ {user.username}</h2>
            <p>คุณเข้าสู่ระบบแล้ว และสามารถเข้าถึงสลากกับแดชบอร์ดของคุณได้</p>
            <button
              className="login-logout-button"
              type="button"
              onClick={onLogout}
              disabled={authLoading}
            >
              {authLoading ? 'กำลังออกจากระบบ...' : 'ออกจากระบบ'}
            </button>
          </div>
        ) : (
          <form onSubmit={this.handleSubmit} className="login-form">
            <label>
              ชื่อผู้ใช้
              <input
                type="text"
                name="username"
                autoComplete="username"
                value={form.username}
                onChange={this.handleFieldChange}
                required
              />
            </label>
            <label>
              รหัสผ่าน
              <input
                type="password"
                name="password"
                autoComplete={isRegistering ? 'new-password' : 'current-password'}
                value={form.password}
                onChange={this.handleFieldChange}
                minLength={isRegistering ? 10 : undefined}
                required
              />
            </label>
            <button type="submit" disabled={loading}>
              {loading ? 'กรุณารอสักครู่...' : isRegistering ? 'สร้างบัญชี' : 'เข้าสู่ระบบ'}
            </button>
            {isRegistering ? (
              <button type="button" onClick={() => this.handleModeChange('login')}>
                กลับไปหน้าเข้าสู่ระบบ
              </button>
            ) : (
              <button type="button" onClick={() => this.handleModeChange('register')}>
                สมัครสมาชิก
              </button>
            )}
          </form>
        )}
        <div className="hero-visual" role="img" aria-label="ภาพคาเฟ่สไตล์มินิมอลที่มีแสงแดดและตกแต่งด้วยไม้โทนอุ่น">
          <img src={l_loto_korea} alt="เข้าสู่ระบบ" />
        </div>
      </section>
    )
  }
}

export default LoginContent;
