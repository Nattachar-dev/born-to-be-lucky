import { Component } from 'react'
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
      const response = await fetch(
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
        throw new Error(data?.detail || `Request failed (${response.status}).`);
      }
      if (!data) {
        throw new Error('The server returned an unexpected response.');
      }

      if (isRegistering) {
        this.setState({
          mode: 'login',
          message: 'Account created. Please log in.',
        });
      } else {
        if (!data.username || !data.token) {
          throw new Error('The login response is missing account information.');
        }
        this.props.onLogin({ id: data.id, username: data.username, token: data.token });
      }
    } catch (error) {
      this.setState({
        error: error instanceof Error ? error.message : 'Unable to complete the request.',
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
        <h2>{user ? 'Lucky ☘' : isRegistering ? 'Register' : 'Login'}</h2>
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        {user ? (
          <div className="login-success">
            <h2>Welcome {user.username}</h2>
            <p>You are signed in and can access your tickets and dashboard.</p>
            <button
              className="login-logout-button"
              type="button"
              onClick={onLogout}
              disabled={authLoading}
            >
              {authLoading ? 'Logging out...' : 'Logout'}
            </button>
          </div>
        ) : (
          <form onSubmit={this.handleSubmit} className="login-form">
            <label>
              Username
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
              Password
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
              {loading ? 'Please wait...' : isRegistering ? 'Create account' : 'Login'}
            </button>
            {isRegistering ? (
              <button type="button" onClick={() => this.handleModeChange('login')}>
                Back to login
              </button>
            ) : (
              <button type="button" onClick={() => this.handleModeChange('register')}>
                Register
              </button>
            )}
          </form>
        )}
        <div className="hero-visual" role="img" aria-label="Sunlit minimalist cafe with warm wooden details">
          <img src={l_loto_korea} alt="Login" />
        </div>
      </section>
    )
  }
}

export default LoginContent;
