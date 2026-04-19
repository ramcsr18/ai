import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { INITIAL_RESOURCES } from '../data/seedData';
import { changePassword, loginWithPassword } from '../services/taskApi';

const USER_STORAGE_KEY = 'sprint-manager-user';
const RESOURCE_STORAGE_KEY = 'sprint-manager-resources';
const AUTH_STATE_KEY = 'sprint-manager-oracle-auth-state';
const PKCE_VERIFIER_KEY = 'sprint-manager-oracle-pkce-verifier';
const PKCE_NONCE_KEY = 'sprint-manager-oracle-pkce-nonce';
const CALLBACK_IN_FLIGHT_KEY = 'sprint-manager-oracle-callback-in-flight';
const ORACLE_SSO_DISABLED = true;

const AuthContext = createContext(null);

function normalizeBaseUrl(url) {
  return (url || '').trim().replace(/\/+$/, '');
}

function parseEnvList(value) {
  return (value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function writeCachedResources(resources) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(RESOURCE_STORAGE_KEY, JSON.stringify(resources));
}

function normalizeIdentity(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeRegisteredResource(resource) {
  if (!resource || typeof resource !== 'object') {
    return null;
  }

  const name = String(resource.name || '').trim();
  const email = normalizeIdentity(resource.email);
  const role = String(resource.role || 'Contributor').trim() === 'Manager' ? 'Manager' : 'Contributor';
  const requiresPasswordChange = Boolean(
    resource.requiresPasswordChange ?? resource.require_password_change ?? true
  );

  if (!name || !email) {
    return null;
  }

  return {
    ...resource,
    name,
    email,
    role,
    requiresPasswordChange,
  };
}

async function fetchRegisteredResources() {
  if (process.env.NODE_ENV === 'test') {
    const resources = INITIAL_RESOURCES.map(normalizeRegisteredResource).filter(Boolean);
    writeCachedResources(resources);
    return resources;
  }

  if (typeof window === 'undefined') {
    return [];
  }

  const apiBaseUrl =
    normalizeBaseUrl(process.env.REACT_APP_API_BASE_URL) ||
    (window.location.port === '3000' ? 'http://localhost:4000' : '');

  const response = await fetch(`${apiBaseUrl}/api/resources`);

  if (!response.ok) {
    throw new Error('Unable to load registered resources.');
  }

  const payload = await response.json().catch(() => ({}));
  const resources = (Array.isArray(payload.resources) ? payload.resources : [])
    .map(normalizeRegisteredResource)
    .filter(Boolean);

  if (resources.length) {
    writeCachedResources(resources);
  }

  return resources;
}

async function findRegisteredResourceByEmail(email) {
  const normalizedEmail = normalizeIdentity(email);

  if (!normalizedEmail) {
    return null;
  }

  const resources = await fetchRegisteredResources();

  return (
    resources.find((resource) => resource.email === normalizedEmail) || null
  );
}

function getOracleConfig() {
  const domainUrl = normalizeBaseUrl(process.env.REACT_APP_ORACLE_DOMAIN_URL);
  const clientId = (process.env.REACT_APP_ORACLE_CLIENT_ID || '').trim();
  const redirectUri =
    (process.env.REACT_APP_ORACLE_REDIRECT_URI || '').trim() ||
    (typeof window !== 'undefined' ? window.location.origin : '');
  const allowedEmailDomains = parseEnvList(process.env.REACT_APP_ORACLE_ALLOWED_EMAIL_DOMAINS);
  const missingFields = [];

  if (!domainUrl) {
    missingFields.push('REACT_APP_ORACLE_DOMAIN_URL');
  }

  if (!clientId) {
    missingFields.push('REACT_APP_ORACLE_CLIENT_ID');
  }

  if (!redirectUri) {
    missingFields.push('REACT_APP_ORACLE_REDIRECT_URI');
  }

  if (!allowedEmailDomains.length) {
    missingFields.push('REACT_APP_ORACLE_ALLOWED_EMAIL_DOMAINS');
  }

  return {
    domainUrl,
    clientId,
    redirectUri,
    scope: (process.env.REACT_APP_ORACLE_SCOPE || 'openid profile email').trim(),
    allowedEmailDomains,
    missingFields,
  };
}

function getOracleEndpoints(domainUrl) {
  return {
    authorize: `${domainUrl}/oauth2/v1/authorize`,
    token: `${domainUrl}/oauth2/v1/token`,
    userInfo: `${domainUrl}/oauth2/v1/userinfo`,
  };
}

function readStoredUser() {
  if (typeof window === 'undefined') {
    return null;
  }

  const storedUser = window.localStorage.getItem(USER_STORAGE_KEY);

  if (!storedUser) {
    return null;
  }

  try {
    return JSON.parse(storedUser);
  } catch {
    return null;
  }
}

function generateRandomString(length = 64) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = new Uint8Array(length);
  window.crypto.getRandomValues(bytes);

  return Array.from(bytes, (value) => charset[value % charset.length]).join('');
}

function toBase64Url(buffer) {
  const binary = String.fromCharCode(...new Uint8Array(buffer));

  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256(value) {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);

  return window.crypto.subtle.digest('SHA-256', data);
}

function clearOracleSessionArtifacts() {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.removeItem(AUTH_STATE_KEY);
  window.sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  window.sessionStorage.removeItem(PKCE_NONCE_KEY);
  window.sessionStorage.removeItem(CALLBACK_IN_FLIGHT_KEY);
}

function removeAuthParamsFromUrl() {
  if (typeof window === 'undefined') {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.delete('code');
  url.searchParams.delete('state');
  url.searchParams.delete('error');
  url.searchParams.delete('error_description');
  window.history.replaceState({}, document.title, url.toString());
}

function isEmployeeEmail(email, allowedEmailDomains) {
  const normalizedEmail = (email || '').trim().toLowerCase();

  if (!normalizedEmail.includes('@')) {
    return false;
  }

  if (!allowedEmailDomains.length) {
    return true;
  }

  const emailDomain = normalizedEmail.split('@').pop();

  return allowedEmailDomains.includes(emailDomain);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser);
  const [authStatus, setAuthStatus] = useState('idle');
  const [authError, setAuthError] = useState('');

  const oracleConfig = useMemo(() => getOracleConfig(), []);
  const isOracleConfigured = !ORACLE_SSO_DISABLED && oracleConfig.missingFields.length === 0;
  const oracleConfigError = isOracleConfigured
    ? ''
    : ORACLE_SSO_DISABLED
      ? 'Oracle SSO is temporarily disabled.'
      : `Oracle SSO is not fully configured. Missing: ${oracleConfig.missingFields.join(', ')}`;
  const canUseDemoLogin = process.env.REACT_APP_ALLOW_DEMO_LOGIN !== 'false';

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (user) {
      window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
      return;
    }

    window.localStorage.removeItem(USER_STORAGE_KEY);
  }, [user]);

  useEffect(() => {
    if (process.env.NODE_ENV === 'test' || !user?.email) {
      return;
    }

    let isCancelled = false;

    const validateStoredUser = async () => {
      try {
        const registeredResource = await findRegisteredResourceByEmail(user.email);

        if (!registeredResource && !isCancelled) {
          setUser(null);
          setAuthError('Your resource email is no longer registered for Sprint Board access.');
        }
      } catch {
        if (!isCancelled) {
          setAuthError('Unable to verify your resource access from the Sprint Board API.');
        }
      }
    };

    void validateStoredUser();

    return () => {
      isCancelled = true;
    };
  }, [user?.email]);

  useEffect(() => {
    if (ORACLE_SSO_DISABLED || !isOracleConfigured || typeof window === 'undefined') {
      return;
    }

    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const oauthError = url.searchParams.get('error');

    if (!code && !oauthError) {
      return;
    }

    if (window.sessionStorage.getItem(CALLBACK_IN_FLIGHT_KEY) === 'true') {
      return;
    }

    if (oauthError) {
      setAuthStatus('idle');
      setAuthError(url.searchParams.get('error_description') || 'Oracle SSO authentication failed.');
      clearOracleSessionArtifacts();
      removeAuthParamsFromUrl();
      return;
    }

    const savedState = window.sessionStorage.getItem(AUTH_STATE_KEY);
    const codeVerifier = window.sessionStorage.getItem(PKCE_VERIFIER_KEY);

    if (!state || state !== savedState || !codeVerifier) {
      setAuthStatus('idle');
      setAuthError('Oracle SSO validation failed. Please try signing in again.');
      clearOracleSessionArtifacts();
      removeAuthParamsFromUrl();
      return;
    }

    window.sessionStorage.setItem(CALLBACK_IN_FLIGHT_KEY, 'true');

    const completeOracleLogin = async () => {
      try {
        setAuthStatus('authenticating');
        setAuthError('');

        const endpoints = getOracleEndpoints(oracleConfig.domainUrl);
        const tokenResponse = await fetch(endpoints.token, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: oracleConfig.redirectUri,
            client_id: oracleConfig.clientId,
            code_verifier: codeVerifier,
          }).toString(),
        });

        if (!tokenResponse.ok) {
          throw new Error('Unable to exchange the Oracle authorization code.');
        }

        const tokenPayload = await tokenResponse.json();
        const profileResponse = await fetch(endpoints.userInfo, {
          headers: {
            Authorization: `Bearer ${tokenPayload.access_token}`,
          },
        });

        if (!profileResponse.ok) {
          throw new Error('Unable to read the Oracle user profile.');
        }

        const profile = await profileResponse.json();
        const email = profile.email || profile.preferred_username || profile.sub || '';

        if (!isEmployeeEmail(email, oracleConfig.allowedEmailDomains)) {
          throw new Error('Only employees can access this workspace.');
        }

        const registeredResource = await findRegisteredResourceByEmail(email);

        if (!registeredResource) {
          throw new Error('Only admin-registered resource emails can access this workspace.');
        }

        setUser({
          name: registeredResource.name,
          email: registeredResource.email,
          role: registeredResource.role === 'Manager' ? 'admin' : 'user',
          registrationRole: registeredResource.role,
          mustChangePassword: false,
          authProvider: 'oracle',
        });
        setAuthStatus('idle');
      } catch (error) {
        setUser(null);
        setAuthStatus('idle');
        setAuthError(error.message || 'Oracle SSO sign-in failed.');
      } finally {
        clearOracleSessionArtifacts();
        removeAuthParamsFromUrl();
      }
    };

    completeOracleLogin();
  }, [isOracleConfigured, oracleConfig]);

  const startOracleLogin = async () => {
    if (ORACLE_SSO_DISABLED) {
      setAuthError('Oracle SSO is temporarily disabled.');
      return;
    }

    if (!isOracleConfigured || typeof window === 'undefined') {
      setAuthError('Oracle SSO is not configured. Add the Oracle environment variables first.');
      return;
    }

    const state = generateRandomString(32);
    const nonce = generateRandomString(32);
    const codeVerifier = generateRandomString(96);
    const codeChallenge = toBase64Url(await sha256(codeVerifier));
    const endpoints = getOracleEndpoints(oracleConfig.domainUrl);
    const authorizeUrl = new URL(endpoints.authorize);

    authorizeUrl.searchParams.set('client_id', oracleConfig.clientId);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('redirect_uri', oracleConfig.redirectUri);
    authorizeUrl.searchParams.set('scope', oracleConfig.scope);
    authorizeUrl.searchParams.set('state', state);
    authorizeUrl.searchParams.set('nonce', nonce);
    authorizeUrl.searchParams.set('code_challenge', codeChallenge);
    authorizeUrl.searchParams.set('code_challenge_method', 'S256');

    window.sessionStorage.setItem(AUTH_STATE_KEY, state);
    window.sessionStorage.setItem(PKCE_NONCE_KEY, nonce);
    window.sessionStorage.setItem(PKCE_VERIFIER_KEY, codeVerifier);
    setAuthStatus('redirecting');
    setAuthError('');
    window.location.assign(authorizeUrl.toString());
  };

  const loginDemo = async ({ email, password }) => {
    if (!canUseDemoLogin) {
      setAuthError('Demo login is disabled for this environment.');
      return;
    }

    try {
      const payload = await loginWithPassword(email, password);
      setUser(payload.user);
      setAuthError('');
    } catch (error) {
      if (error.message === 'Unable to reach the Sprint Board API.') {
        setAuthError(
          'Unable to reach the Sprint Board API. Start the app with "npm start" so the UI and SQLite API run together, or start "npm run server" separately.'
        );
        return;
      }

      setAuthError(error.message || 'Unable to sign in with email and password.');
    }
  };

  const updatePassword = async ({ currentPassword, newPassword }) => {
    if (!user?.email) {
      throw new Error('You need to sign in before updating the password.');
    }

    const payload = await changePassword(user.email, currentPassword, newPassword);
    setUser(payload.user);
    setAuthError('');
    return payload.user;
  };

  const logout = () => {
    clearOracleSessionArtifacts();
    removeAuthParamsFromUrl();
    setUser(null);
    setAuthStatus('idle');
    setAuthError('');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        authStatus,
        authError,
        isOracleConfigured,
        oracleConfigError,
        canUseDemoLogin,
        startOracleLogin,
        loginDemo,
        updatePassword,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }

  return context;
}
