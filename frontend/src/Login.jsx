import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginHunter } from './api';

export default function Login() {
  const [name, setName]         = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);
  const [loading, setLoading]   = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);
    try {
      await loginHunter({ name, password });
      navigate('/');
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="center-screen">
      <div className="panel animate-in" style={{ maxWidth: '440px', width: '100%' }}>

        {/* Header */}
        <div className="mb-lg" style={{ borderBottom: '1px solid var(--clr-border)', paddingBottom: 'var(--space-md)' }}>
          <h2>Eclipse Gateway</h2>
          <p className="text-dim text-xs text-upper mt-sm" style={{ letterSpacing: '2px' }}>
            Status: Awaiting Credentials
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label className="form-label">Identity [Name / Email]</label>
            <input
              type="text"
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="hunter_id"
              autoComplete="username"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Passphrase</label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          <button type="submit" className="btn btn-primary btn-full mt-md" disabled={loading}>
            {loading ? <><span className="loading-dots">Transmitting</span></> : '> Establish Connection'}
          </button>
        </form>

        {/* Error */}
        {errorMsg && (
          <div className="alert alert-error mt-md">
            [!] {errorMsg}
          </div>
        )}


      </div>
    </div>
  );
}
