import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// MUST be imported before any lazy route — installs the global axios
// interceptor that stamps the panel Bearer token on every /exocore/api/*
// request, eliminating 401 races when navigating directly into /editor.
import './access/panelAuth';
import './access/loadingBar';
import PanelDevsGuard from './access/panel-devs';

import './styles/base.css';
import './styles/shared.css';
import './access/auth/auth.css';
import './editor/editor.css';
import './profile/profile.css';
import './leaderboard/leaderboard.css';

const Editor       = lazy(() => import('./editor/coding'));
const Profile      = lazy(() => import('./profile/Profile'));
const Leaderboard  = lazy(() => import('./leaderboard/Leaderboard'));
const Home         = lazy(() => import('./access/auth/Home'));
const Login        = lazy(() => import('./access/auth/Login'));
const Register     = lazy(() => import('./access/auth/Register'));
const Forgot       = lazy(() => import('./access/auth/Forgot'));
const VerifyPending = lazy(() => import('./access/auth/VerifyPending'));
const AuthCallback  = lazy(() => import('./access/auth/AuthCallback'));
const Dashboard    = lazy(() => import('./home/Dashboard'));

const PageLoader: React.FC = () => (
    <div className="page-loader">
        <div className="page-loader-spinner" />
        <span>Loading Exocore…</span>
    </div>
);

const rootElement = document.getElementById('root') as HTMLElement;

ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
        <BrowserRouter basename="/exocore">
            <PanelDevsGuard>
                <Suspense fallback={<PageLoader />}>
                    <Routes>
                        <Route path="/"          element={<Home />} />
                        <Route path="/login"     element={<Login />} />
                        <Route path="/register"  element={<Register />} />
                        <Route path="/forgot"    element={<Forgot />} />
                        <Route path="/verify-pending" element={<VerifyPending />} />
                        <Route path="/auth/callback"  element={<AuthCallback />} />
                        <Route path="/dashboard" element={<Dashboard />} />
                        <Route path="/editor"    element={<Editor />} />
                        <Route path="/u/:username" element={<Profile />} />
                        <Route path="/leaderboard" element={<Leaderboard />} />
                        <Route path="*"          element={<Navigate to="/" replace />} />
                    </Routes>
                </Suspense>
            </PanelDevsGuard>
        </BrowserRouter>
    </React.StrictMode>
);
