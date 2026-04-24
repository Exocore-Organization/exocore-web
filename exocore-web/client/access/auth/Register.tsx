import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import AuthLayout from '../components/AuthLayout';
import PasswordInput from './PasswordInput';
import { COUNTRIES, findCountryByCode } from './countries';

interface RegisterForm {
    user: string;
    pass: string;
    confirmPass: string;
    email: string;
    nickname: string;
    bio: string;
    dob: string;
    country: string;
}

const STEP_TITLES = ['Account', 'About you', 'Where & when', 'Avatar', 'Cover photo'];

const validatePasswordClient = (pw: string): string => {
    if (!pw) return 'Password is required.';
    if (pw.length < 10) return 'Password must be at least 10 characters.';
    if (!/[a-z]/.test(pw)) return 'Add a lowercase letter.';
    if (!/[A-Z]/.test(pw)) return 'Add an uppercase letter.';
    if (!/\d/.test(pw)) return 'Add a number.';
    if (!/[^A-Za-z0-9]/.test(pw)) return 'Add a symbol (e.g. !@#$%).';
    if (/\s/.test(pw)) return 'No spaces allowed.';
    return '';
};

const passwordStrength = (pw: string): { score: number; label: string; color: string } => {
    let s = 0;
    if (pw.length >= 10) s++;
    if (pw.length >= 14) s++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
    if (/\d/.test(pw)) s++;
    if (/[^A-Za-z0-9]/.test(pw)) s++;
    const tiers = [
        { label: 'Too weak', color: '#d44' },
        { label: 'Weak', color: '#e88' },
        { label: 'Fair', color: '#e0a043' },
        { label: 'Good', color: '#9bd048' },
        { label: 'Strong', color: '#43d473' },
        { label: 'Excellent', color: '#43d473' },
    ];
    return { score: s, label: tiers[Math.min(s, tiers.length - 1)].label, color: tiers[Math.min(s, tiers.length - 1)].color };
};

const Register: React.FC = () => {
    const navigate = useNavigate();
    const [step, setStep] = useState(0);
    const [form, setForm] = useState<RegisterForm>({
        user: '', pass: '', confirmPass: '', email: '', nickname: '', bio: '', dob: '', country: '',
    });
    const [avatar, setAvatar] = useState<File | null>(null);
    const [cover, setCover] = useState<File | null>(null);
    const avatarPreview = useMemo(() => avatar ? URL.createObjectURL(avatar) : '', [avatar]);
    const coverPreview = useMemo(() => cover ? URL.createObjectURL(cover) : '', [cover]);
    const [avatarStatus, setAvatarStatus] = useState<'idle' | 'processing' | 'ready' | 'error'>('idle');
    const [coverStatus, setCoverStatus] = useState<'idle' | 'processing' | 'ready' | 'error'>('idle');
    const [error, setError] = useState('');

    const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

    const handleImagePick = (
        file: File | null,
        kind: 'avatar' | 'cover',
    ) => {
        const setFile = kind === 'avatar' ? setAvatar : setCover;
        const setStatus = kind === 'avatar' ? setAvatarStatus : setCoverStatus;
        setError('');
        if (!file) { setFile(null); setStatus('idle'); return; }
        if (!file.type.startsWith('image/')) {
            setStatus('error');
            setError('Please choose an image file (JPEG, PNG, WebP).');
            return;
        }
        if (file.size > MAX_IMAGE_BYTES) {
            setStatus('error');
            setError(`Image is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max is 5 MB.`);
            return;
        }
        setStatus('processing');
        setFile(file);
        // Verify the browser can actually decode it before letting the user advance.
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); setStatus('ready'); };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            setStatus('error');
            setFile(null);
            setError('That image could not be read. Try a different file.');
        };
        img.src = url;
    };
    const [loading, setLoading] = useState(false);
    const [detectingCountry, setDetectingCountry] = useState(false);
    const detectedRef = useRef(false);
    const [countryQuery, setCountryQuery] = useState('');

    useEffect(() => {
        if (localStorage.getItem('exo_token')) navigate('/dashboard');
    }, [navigate]);

    // Auto-detect country once when arriving on step 2 (Where & when)
    useEffect(() => {
        if (step !== 2 || detectedRef.current || form.country) return;
        detectedRef.current = true;
        setDetectingCountry(true);
        axios.get('https://ipapi.co/json/', { timeout: 4000 })
            .then(r => {
                const code = r.data?.country_code || r.data?.country;
                const cc = findCountryByCode(String(code || ''));
                if (cc) setForm(prev => ({ ...prev, country: cc.name }));
            })
            .catch(() => {})
            .finally(() => setDetectingCountry(false));
    }, [step, form.country]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const filteredCountries = useMemo(() => {
        if (!countryQuery) return COUNTRIES.slice(0, 12);
        const q = countryQuery.toLowerCase();
        return COUNTRIES.filter(c => c.name.toLowerCase().includes(q)).slice(0, 12);
    }, [countryQuery]);

    const validateStep = (s: number): string => {
        if (s === 0) {
            if (!form.user.trim() || form.user.trim().length < 3) return 'Username must be at least 3 characters.';
            if (!form.email.trim() || !/^\S+@\S+\.\S+$/.test(form.email)) return 'Enter a valid email address.';
            const p = validatePasswordClient(form.pass);
            if (p) return p;
            if (form.pass !== form.confirmPass) return 'Passwords do not match.';
        }
        if (s === 1) {
            if (form.nickname && form.nickname.length > 50) return 'Nickname is too long.';
        }
        if (s === 2) {
            if (form.dob && !/^\d{4}-\d{2}-\d{2}$/.test(form.dob)) return 'Invalid date.';
        }
        if (s === 3) {
            if (avatarStatus === 'processing') return 'Hang on — we’re still preparing your avatar.';
            if (avatarStatus === 'error') return 'Please pick a valid avatar image, or remove it to skip.';
        }
        if (s === 4) {
            if (coverStatus === 'processing') return 'Hang on — we’re still preparing your cover photo.';
            if (coverStatus === 'error') return 'Please pick a valid cover image, or remove it to skip.';
        }
        return '';
    };

    const next = () => {
        const v = validateStep(step);
        if (v) { setError(v); return; }
        setError('');
        setStep(s => Math.min(s + 1, STEP_TITLES.length - 1));
    };
    const back = () => { setError(''); setStep(s => Math.max(0, s - 1)); };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        for (let i = 0; i <= step; i++) {
            const v = validateStep(i);
            if (v) { setError(v); setStep(i); return; }
        }

        setLoading(true);
        try {
            const { rpc, rpcFile } = await import('../rpcClient');
            const payload: Record<string, unknown> = {
                user: form.user.trim(),
                pass: form.pass,
                email: form.email.trim().toLowerCase(),
                nickname: form.nickname || form.user,
                bio: form.bio,
                dob: form.dob,
                country: form.country,
                host: window.location.origin,
            };
            if (avatar) payload.avatar = await rpcFile(avatar);
            if (cover) payload.cover = await rpcFile(cover);

            const resp = await rpc.call<any>('auth.register', payload, { token: '' });
            const data = resp?.data ?? resp;
            // Stash a pending verification context so VerifyPending can pre-fill.
            sessionStorage.setItem('exo_pending_verify', JSON.stringify({
                email: data.email || form.email.trim().toLowerCase(),
                nickname: data.nickname || form.nickname || form.user,
                username: data.username,
            }));
            navigate(`/verify-pending?email=${encodeURIComponent(form.email.trim().toLowerCase())}`);
        } catch (err: any) {
            const msg = err?.response?.data?.message || 'Registration failed. Please try again.';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const strength = passwordStrength(form.pass);

    return (
        <AuthLayout
            title="Create your account"
            subtitle={`Step ${step + 1} of ${STEP_TITLES.length} — ${STEP_TITLES[step]}`}
            footerContent={<>Already have an account? <Link to="/login">Sign in</Link></>}
        >
            <div className="reg-progress" aria-label="progress">
                {STEP_TITLES.map((t, i) => (
                    <span key={t} className={`reg-progress-bar ${i <= step ? 'active' : ''}`} />
                ))}
            </div>

            <form className="form-stack" onSubmit={handleSubmit}>
                {step === 0 && (
                    <>
                        <div className="field">
                            <label className="field-label">Username</label>
                            <input className="field-input" name="user" type="text" placeholder="@yourname"
                                value={form.user} onChange={handleChange} autoFocus autoComplete="username" />
                        </div>
                        <div className="field">
                            <label className="field-label">Email</label>
                            <input className="field-input" name="email" type="email" placeholder="you@example.com"
                                value={form.email} onChange={handleChange} autoComplete="email" />
                        </div>
                        <div className="field">
                            <label className="field-label">Password</label>
                            <PasswordInput name="pass" placeholder="Min. 10 chars, mix Aa1!"
                                value={form.pass} onChange={handleChange} autoComplete="new-password" />
                            {form.pass && (
                                <div className="reg-strength">
                                    <div className="reg-strength-track">
                                        <div className="reg-strength-fill"
                                            style={{ width: `${(strength.score / 5) * 100}%`, background: strength.color }} />
                                    </div>
                                    <span style={{ color: strength.color }}>{strength.label}</span>
                                </div>
                            )}
                        </div>
                        <div className="field">
                            <label className="field-label">Confirm Password</label>
                            <PasswordInput name="confirmPass" placeholder="Repeat password"
                                value={form.confirmPass} onChange={handleChange} autoComplete="new-password"
                                extraClassName={form.confirmPass && form.pass !== form.confirmPass ? 'error' : ''} />
                        </div>
                    </>
                )}

                {step === 1 && (
                    <>
                        <div className="field">
                            <label className="field-label">Nickname</label>
                            <input className="field-input" name="nickname" type="text" placeholder="What should we call you?"
                                value={form.nickname} onChange={handleChange} autoFocus />
                        </div>
                        <div className="field">
                            <label className="field-label">Short bio <span style={{ textTransform: 'none', color: 'var(--text-muted)', fontWeight: 400, letterSpacing: 0 }}>(optional)</span></label>
                            <textarea className="field-input" name="bio" rows={3} maxLength={280}
                                placeholder="A line or two about yourself…"
                                value={form.bio} onChange={handleChange} />
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', alignSelf: 'flex-end' }}>{form.bio.length}/280</span>
                        </div>
                    </>
                )}

                {step === 2 && (
                    <>
                        <div className="field">
                            <label className="field-label">Date of birth</label>
                            <input className="field-input" name="dob" type="date" max={new Date().toISOString().split('T')[0]}
                                value={form.dob} onChange={handleChange} />
                        </div>
                        <div className="field">
                            <label className="field-label">
                                Country {detectingCountry && <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none', marginLeft: 6 }}>· detecting…</span>}
                            </label>
                            <input className="field-input" type="text" placeholder="Search country…"
                                value={form.country || countryQuery}
                                onChange={e => { setCountryQuery(e.target.value); setForm(p => ({ ...p, country: '' })); }} />
                            {!form.country && (
                                <div className="reg-country-list">
                                    {filteredCountries.map(c => (
                                        <button type="button" key={c.code} className="reg-country-item"
                                            onClick={() => { setForm(p => ({ ...p, country: c.name })); setCountryQuery(''); }}>
                                            {c.name}
                                        </button>
                                    ))}
                                    {filteredCountries.length === 0 && (
                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: '0.4rem' }}>No matches</span>
                                    )}
                                </div>
                            )}
                            {form.country && (
                                <button type="button" className="reg-country-clear"
                                    onClick={() => { setForm(p => ({ ...p, country: '' })); setCountryQuery(''); }}>
                                    ✕ Change
                                </button>
                            )}
                        </div>
                    </>
                )}

                {step === 3 && (
                    <div className="field" style={{ alignItems: 'center' }}>
                        <label className="field-label">Avatar (optional)</label>
                        <div className="reg-avatar-pick">
                            <div className="reg-avatar-preview" style={{
                                background: avatarPreview ? `center/cover url(${avatarPreview})` : 'transparent',
                            }}>
                                {!avatarPreview && (form.nickname || form.user || '?').charAt(0).toUpperCase()}
                            </div>
                            <label className={`btn btn-secondary reg-file-btn${avatarStatus === 'processing' ? ' is-disabled' : ''}`}>
                                <input type="file" accept="image/*" hidden
                                    disabled={avatarStatus === 'processing'}
                                    onChange={e => handleImagePick(e.target.files?.[0] || null, 'avatar')} />
                                {avatar ? 'Change avatar' : 'Choose avatar'}
                            </label>
                            {avatar && avatarStatus !== 'processing' && (
                                <button type="button" className="reg-link-btn"
                                    onClick={() => handleImagePick(null, 'avatar')}>Remove</button>
                            )}
                            {avatarStatus === 'processing' && (
                                <p className="reg-hint" style={{ color: 'var(--text-muted)' }}>
                                    <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid #888', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', marginRight: 6, verticalAlign: 'middle' }} />
                                    Preparing avatar…
                                </p>
                            )}
                            {avatarStatus === 'ready' && (
                                <p className="reg-hint" style={{ color: '#43d473' }}>✓ Avatar ready</p>
                            )}
                            <p className="reg-hint">You can change this any time from your profile. Max 5&nbsp;MB.</p>
                        </div>
                    </div>
                )}

                {step === 4 && (
                    <div className="field">
                        <label className="field-label">Cover photo (optional)</label>
                        <div className="reg-cover-preview" style={{
                            background: coverPreview ? `center/cover url(${coverPreview})` : 'linear-gradient(135deg,#1c1c1c,#0a0a0a)',
                        }}>
                            {!coverPreview && <span className="reg-hint" style={{ marginTop: 0 }}>Cover preview</span>}
                        </div>
                        <label className={`btn btn-secondary reg-file-btn${coverStatus === 'processing' ? ' is-disabled' : ''}`} style={{ marginTop: '0.6rem' }}>
                            <input type="file" accept="image/*" hidden
                                disabled={coverStatus === 'processing'}
                                onChange={e => handleImagePick(e.target.files?.[0] || null, 'cover')} />
                            {cover ? 'Change cover' : 'Choose cover'}
                        </label>
                        {cover && coverStatus !== 'processing' && (
                            <button type="button" className="reg-link-btn"
                                onClick={() => handleImagePick(null, 'cover')}>Remove</button>
                        )}
                        {coverStatus === 'processing' && (
                            <p className="reg-hint" style={{ color: 'var(--text-muted)' }}>
                                <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid #888', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', marginRight: 6, verticalAlign: 'middle' }} />
                                Preparing cover…
                            </p>
                        )}
                        {coverStatus === 'ready' && (
                            <p className="reg-hint" style={{ color: '#43d473' }}>✓ Cover ready</p>
                        )}
                        <p className="reg-hint">Max 5&nbsp;MB.</p>
                    </div>
                )}

                {error && (
                    <div className="form-error">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                            <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5"/>
                            <path d="M7 4v3M7 9.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                        {error}
                    </div>
                )}

                <div className="reg-nav">
                    <button type="button" className="btn btn-secondary" onClick={back} disabled={step === 0 || loading}>← Back</button>
                    {step < STEP_TITLES.length - 1 ? (
                        <button type="button" className="btn btn-primary" onClick={next}
                            disabled={loading || (step === 3 && avatarStatus === 'processing') || (step === 4 && coverStatus === 'processing')}>
                            {((step === 3 && avatarStatus === 'processing') || (step === 4 && coverStatus === 'processing'))
                                ? 'Preparing…' : 'Next →'}
                        </button>
                    ) : (
                        <button type="submit" className="btn btn-primary"
                            disabled={loading || coverStatus === 'processing' || avatarStatus === 'processing'}>
                            {loading ? (
                                <>
                                    <span style={{ width: 14, height: 14, border: '2px solid rgba(0,0,0,0.3)', borderTopColor: '#000', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
                                    Creating…
                                </>
                            ) : coverStatus === 'processing' ? (
                                'Preparing…'
                            ) : cover && coverStatus === 'ready' ? (
                                'Create Account'
                            ) : (
                                'Skip & Create Account'
                            )}
                        </button>
                    )}
                </div>
            </form>
        </AuthLayout>
    );
};

export default Register;
