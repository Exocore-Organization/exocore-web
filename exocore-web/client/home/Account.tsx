import React, { useState, useRef } from 'react';
import axios from 'axios';

type AlertType = 'success' | 'error' | 'warning' | 'info';

interface UserData {
    id?: string | number;
    user?: string;
    username?: string;
    nickname?: string;
    email?: string;
    bio?: string;
    dob?: string;
    country?: string;
    timezone?: string;
    verified?: boolean;
    avatarUrl?: string | null;
    coverUrl?: string | null;
    role?: string;
    plan?: string;
    planExpiresAt?: number | null;
}

interface AccountProps {
    userData: UserData | null;
    onBack: () => void;
    onUpdateSuccess: (updatedData: UserData) => void;
    showAlert: (title: string, message: string, type: AlertType) => void;
    onDeleteAccount?: () => void;
}

const ROLE_LABEL: Record<string, string> = { owner: 'OWNER', admin: 'ADMIN', mod: 'MOD', user: 'USER' };
const ROLE_COLOR: Record<string, string> = {
    owner: '#ffd400', admin: '#ff5b5b', mod: '#5bc0ff', user: 'var(--text-muted)',
};

interface AccountForm {
    user: string;
    nickname: string;
    bio: string;
    avatarUrl: string;
    coverUrl: string;
}

const LockIcon = () => (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <rect x="2" y="4.5" width="6" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
        <path d="M3.5 4.5V3a1.5 1.5 0 013 0v1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
);

const Account: React.FC<AccountProps> = ({ userData, onBack, onUpdateSuccess, showAlert, onDeleteAccount }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);

    const avatarInputRef = useRef<HTMLInputElement>(null);
    const coverInputRef = useRef<HTMLInputElement>(null);

    const [form, setForm] = useState<AccountForm>({
        user: userData?.user || '',
        nickname: userData?.nickname || '',
        bio: userData?.bio || '',
        avatarUrl: userData?.avatarUrl || '',
        coverUrl: userData?.coverUrl || '',
    });

    const [previews, setPreviews] = useState({ avatar: '', cover: '' });

    const token = localStorage.getItem('exo_token');

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'avatar' | 'cover') => {
        const file = e.target.files?.[0];
        if (!file) return;
        setPreviews(prev => ({ ...prev, [type]: URL.createObjectURL(file) }));
        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        try {
            showAlert('Uploading', `Syncing ${type}…`, 'info');
            const res = await axios.post('/exocore/api/auth/userinfo', formData, {
                params: { source: `upload-${type}`, token },
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            if (res.data.success) {
                const freshUrl = `${res.data.url}?t=${Date.now()}`;
                setForm(prev => ({ ...prev, [`${type}Url`]: freshUrl }));
                onUpdateSuccess({ ...userData, [`${type}Url`]: freshUrl } as UserData);
                showAlert('Success', `${type === 'avatar' ? 'Avatar' : 'Cover'} updated.`, 'success');
            }
        } catch {
            showAlert('Error', 'Media upload failed.', 'error');
        } finally {
            setUploading(false);
        }
    };

    const handleSave = async () => {
        if (uploading) { showAlert('Wait', 'Media upload in progress.', 'warning'); return; }
        setLoading(true);
        try {
            const res = await axios.post('/exocore/api/auth/userinfo', form, {
                params: { source: 'edit', token },
            });
            if (res.data.success) {
                showAlert('Saved', 'Profile updated successfully.', 'success');
                setIsEditing(false);
                onUpdateSuccess({ ...userData, ...form } as UserData);
            }
        } catch {
            showAlert('Error', 'Failed to save profile.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const avatarSrc = previews.avatar || form.avatarUrl;
    const coverSrc = previews.cover || form.coverUrl;
    const displayName = userData?.nickname || userData?.username || 'Developer';
    const initials = displayName.slice(0, 2).toUpperCase();

    return (
        <div className="account-wrapper">
            {}
            <div className="account-cover">
                {coverSrc && <img src={coverSrc} alt="Cover" />}
                <div className="account-cover-overlay" />
                {isEditing && (
                    <button
                        className="account-cover-edit"
                        onClick={() => coverInputRef.current?.click()}
                        disabled={uploading}
                    >
                        {uploading ? '⌛ Uploading…' : '📷 Change Cover'}
                    </button>
                )}
                <input type="file" ref={coverInputRef} hidden onChange={e => handleFileChange(e, 'cover')} accept="image/*" />
            </div>

            {}
            <div className="account-body">
                <div className="account-profile-row">
                    {}
                    <div className="account-avatar-wrap">
                        {avatarSrc ? (
                            <img src={avatarSrc} alt="Avatar" className="account-avatar" />
                        ) : (
                            <div className="account-avatar-fallback">{initials}</div>
                        )}
                        {isEditing && (
                            <button
                                className="account-avatar-edit"
                                onClick={() => avatarInputRef.current?.click()}
                                disabled={uploading}
                                title="Change avatar"
                            >
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                    <path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            </button>
                        )}
                        <input type="file" ref={avatarInputRef} hidden onChange={e => handleFileChange(e, 'avatar')} accept="image/*" />
                    </div>

                    {}
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', paddingTop: '1rem' }}>
                        {!isEditing ? (
                            <button className="btn btn-secondary btn-sm" onClick={() => setIsEditing(true)}>
                                Edit Profile
                            </button>
                        ) : (
                            <button
                                className="btn btn-primary btn-sm"
                                style={{ width: 'auto' }}
                                onClick={handleSave}
                                disabled={loading || uploading}
                            >
                                {loading ? 'Saving…' : 'Save Changes'}
                            </button>
                        )}
                        <button className="btn btn-secondary btn-sm" onClick={onBack} disabled={loading}>
                            ← Back
                        </button>
                    </div>
                </div>

                {}
                <div style={{ marginBottom: '1.5rem' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                        {form.nickname || displayName}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '3px', fontFamily: 'var(--font-mono)' }}>
                        @{String(userData?.username || '').replace(/^@+/, '')}
                        {userData?.verified && (
                            <span style={{ marginLeft: 6, color: 'var(--cyan)', fontSize: '0.72rem' }}>✓ Verified</span>
                        )}
                    </div>
                </div>

                {}
                <div className="account-fields-grid">
                    {}
                    <div className="account-field">
                        <label className="account-field-label">Display Name</label>
                        <input
                            className="account-field-value"
                            value={form.nickname}
                            onChange={e => setForm(f => ({ ...f, nickname: e.target.value }))}
                            disabled={!isEditing}
                            placeholder="Nickname"
                        />
                    </div>

                    <div className="account-field">
                        <label className="account-field-label">User ID</label>
                        <input
                            className="account-field-value"
                            value={form.user}
                            onChange={e => setForm(f => ({ ...f, user: e.target.value }))}
                            disabled={!isEditing}
                            placeholder="user id"
                        />
                    </div>

                    {}
                    <div className="account-field">
                        <label className="account-field-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            System ID <span className="account-locked-badge"><LockIcon /> locked</span>
                        </label>
                        <input className="account-field-value" value={userData?.id || '—'} disabled readOnly />
                    </div>

                    <div className="account-field">
                        <label className="account-field-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            Username <span className="account-locked-badge"><LockIcon /> locked</span>
                        </label>
                        <input className="account-field-value" value={userData?.username || '—'} disabled readOnly />
                    </div>

                    <div className="account-field">
                        <label className="account-field-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            Email <span className="account-locked-badge"><LockIcon /> locked</span>
                        </label>
                        <input className="account-field-value" value={userData?.email || '—'} disabled readOnly />
                    </div>

                    <div className="account-field">
                        <label className="account-field-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            Country <span className="account-locked-badge"><LockIcon /> locked</span>
                        </label>
                        <input className="account-field-value" value={userData?.country || '—'} disabled readOnly />
                    </div>

                    <div className="account-field">
                        <label className="account-field-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            Timezone <span className="account-locked-badge"><LockIcon /> locked</span>
                        </label>
                        <input className="account-field-value" value={userData?.timezone || '—'} disabled readOnly />
                    </div>

                    <div className="account-field">
                        <label className="account-field-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            Status <span className="account-locked-badge"><LockIcon /> locked</span>
                        </label>
                        <input
                            className="account-field-value"
                            value={userData?.verified ? 'Verified' : 'Unverified'}
                            disabled readOnly
                            style={{ color: userData?.verified ? 'var(--green)' : 'var(--text-muted)' }}
                        />
                    </div>

                    {}
                    <div className="account-field">
                        <label className="account-field-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            Role <span className="account-locked-badge"><LockIcon /> locked</span>
                        </label>
                        <input
                            className="account-field-value"
                            value={ROLE_LABEL[(userData?.role || 'user').toLowerCase()] || 'USER'}
                            disabled readOnly
                            style={{
                                color: ROLE_COLOR[(userData?.role || 'user').toLowerCase()] || 'var(--text-muted)',
                                fontWeight: 700, letterSpacing: '0.05em',
                            }}
                        />
                    </div>

                    {}
                    <div className="account-field">
                        <label className="account-field-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            Plan <span className="account-locked-badge"><LockIcon /> locked</span>
                        </label>
                        <input
                            className="account-field-value"
                            value={(userData?.plan || 'free').toUpperCase()}
                            disabled readOnly
                            style={{
                                color: userData?.plan === 'exo' ? '#ffd400' : 'var(--text-muted)',
                                fontWeight: 700,
                            }}
                        />
                    </div>

                    {}
                    <div className="account-field">
                        <label className="account-field-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            Presence <span className="account-locked-badge"><LockIcon /> live</span>
                        </label>
                        <input
                            className="account-field-value"
                            value="● Online"
                            disabled readOnly
                            style={{ color: 'var(--green, #2ecc71)', fontWeight: 700 }}
                        />
                    </div>

                    {}
                    <div className="account-field account-field-span">
                        <label className="account-field-label">Bio</label>
                        <textarea
                            className="account-field-value"
                            value={form.bio}
                            onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                            disabled={!isEditing}
                            placeholder="Tell us about yourself…"
                            rows={3}
                        />
                    </div>
                </div>

                {}
                {onDeleteAccount && (
                    <div
                        style={{
                            marginTop: '2rem',
                            padding: '1rem 1.25rem',
                            border: '1px solid rgba(255, 91, 91, 0.4)',
                            borderRadius: 10,
                            background: 'rgba(255, 91, 91, 0.04)',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#ff5b5b', letterSpacing: '0.02em' }}>
                                ⚠ Danger Zone
                            </span>
                        </div>
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 0.75rem' }}>
                            Permanently erase your Exocore account, profile, posts, and uploads. Hindi na maibabalik ito.
                        </p>
                        <button
                            className="btn"
                            onClick={onDeleteAccount}
                            style={{
                                background: 'transparent',
                                color: '#ff5b5b',
                                border: '1px solid #ff5b5b',
                                borderRadius: 6,
                                padding: '6px 14px',
                                fontWeight: 700,
                                fontSize: '0.78rem',
                                cursor: 'pointer',
                            }}
                        >
                            Delete my account
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Account;
