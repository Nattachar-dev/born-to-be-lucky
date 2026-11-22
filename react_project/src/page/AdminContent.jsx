import { Component } from 'react'
import './../App.css'
import { thaiErrorMessage } from '../utils/thai'

class AdminContent extends Component {
  state = {
    activeAction: '',
    error: '',
    message: '',
  }

  runAction = async (action, endpoint) => {
    const { token, user } = this.props;
    if (!token || !user?.isStaff || this.state.activeAction) {
      return;
    }

    this.setState({ activeAction: action, error: '', message: '' });
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Token ${token}` },
      });
      const contentType = response.headers.get('content-type') || '';
      const data = contentType.includes('application/json')
        ? await response.json()
        : null;

      if (!response.ok) {
        throw new Error(data?.detail || `คำขอไม่สำเร็จ (รหัส ${response.status})`);
      }
      if (!data || !Number.isFinite(Number(data.generated_count))) {
        throw new Error('เซิร์ฟเวอร์ส่งข้อมูลตอบกลับไม่ถูกต้อง');
      }

      const message = action === 'sixlotto'
        ? `สร้างรางวัลล็อตโต้ 6 จำนวน ${data.generated_count} รายการ สำหรับวันที่ ${data.trans_date}`
        : `สร้างบัตรสลากขูด ${data.generated_count} ใบ ครอบคลุม ${data.country_count} ประเทศ`;
      this.setState({ message });
    } catch (error) {
      this.setState({
        error: thaiErrorMessage(error, 'ไม่สามารถสร้างรางวัลสลากได้ โปรดลองอีกครั้ง'),
      });
    } finally {
      this.setState({ activeAction: '' });
    }
  }

  render() {
    const { user, token } = this.props;
    const { activeAction, error, message } = this.state;
    if (!token || !user?.isStaff) {
      return (
        <section className="panel admin-panel">
          <h2>ผู้ดูแลระบบ</h2>
          <p role="alert">หน้านี้จำกัดการเข้าถึงเฉพาะบัญชีผู้ดูแลระบบเท่านั้น</p>
        </section>
      );
    }

    return (
      <section className="panel admin-panel" aria-busy={Boolean(activeAction)}>
        <div className="section-header">
          <div>
            <p className="eyebrow">การจัดการระบบ</p>
            <h2>รางวัลสลาก</h2>
          </div>
        </div>
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        <div className="cta-row admin-actions">
          <button
            type="button"
            disabled={Boolean(activeAction)}
            onClick={() => this.runAction('sixlotto', '/api/daily/reward/sixlotto/')}
          >
            {activeAction === 'sixlotto'
              ? 'กำลังสร้างรางวัลล็อตโต้ 6...'
              : 'สร้างรางวัลล็อตโต้ 6 ประจำวัน'}
          </button>
          <button
            type="button"
            disabled={Boolean(activeAction)}
            onClick={() => this.runAction('scratchlotto', '/api/daily/reward/scratchlotto/')}
          >
            {activeAction === 'scratchlotto'
              ? 'กำลังสร้างบัตรสลากขูด...'
              : 'สร้างบัตรสลากขูด'}
          </button>
        </div>
      </section>
    );
  }
}

export default AdminContent
