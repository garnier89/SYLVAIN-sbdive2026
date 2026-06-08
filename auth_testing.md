# Auth-Gated App Testing Playbook (Emergent Google Auth)

## Step 1: Create Test User & Session (mongosh)
```
mongosh --eval "
use('test_database');
var userId = 'test-user-' + Date.now();
var sessionToken = 'test_session_' + Date.now();
db.users.insertOne({ user_id: userId, email: 'test.user.'+Date.now()+'@example.com', name: 'Test User', picture: 'https://via.placeholder.com/150', created_at: new Date() });
db.user_sessions.insertOne({ user_id: userId, session_token: sessionToken, expires_at: new Date(Date.now()+7*24*60*60*1000), created_at: new Date() });
print('Session token: ' + sessionToken); print('User ID: ' + userId);
"
```

## Step 2: Backend API
```
curl -X GET "$URL/api/auth/me" -H "Authorization: Bearer YOUR_SESSION_TOKEN"
```

## Step 3: Browser Testing (set cookie)
```
await page.context.add_cookies([{ "name":"session_token","value":"TOKEN","domain":"<host>","path":"/","httpOnly":true,"secure":true,"sameSite":"None" }])
await page.goto("<URL>")
```

## Flow summary
1. Frontend "Continue with Google" -> redirect to https://auth.emergentagent.com/?redirect=<window.location.origin + route>
2. Returns to {redirect}#session_id=...
3. AppRouter detects location.hash session_id synchronously (before ProtectedRoute) -> AuthCallback
4. AuthCallback POSTs session_id to backend -> backend calls https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data with X-Session-ID -> gets {id,email,name,picture,session_token}
5. Backend upserts user (by email), stores session_token (7d expiry), sets httpOnly cookie session_token (path=/, secure, samesite=none)
6. Redirect to dashboard.

## Checklist
- user doc has user_id field; session user_id matches; queries use {"_id":0}
- /api/auth/me returns user data via cookie OR Authorization Bearer
- DO NOT hardcode redirect URL; use window.location.origin
