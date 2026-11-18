# Blood Link — Role-based Blood Donor & Receiver App

Blood Link is a responsive web application with separate donor and receiver workspaces.

## Technology
- Frontend: HTML, CSS, vanilla JavaScript
- Backend: Node.js + Express
- Storage: local JSON file (`data.json`)
- Optional email notifications: Nodemailer + SMTP
- In-app alerts: browser polling and Web Audio notification tones
- PWA install support with an app manifest, icon and cached frontend shell

## Run in Kiro
1. Install Node.js LTS: https://nodejs.org
2. Extract this ZIP and open the `blood-link-app` folder in Kiro.
3. Open Terminal → New Terminal.
4. Run:
   ```bash
   npm install
   npm start
   ```
5. Visit http://localhost:3000

For development auto-restart:
```bash
npm run dev
```

## App workflows

### Donor
- Select “I'm a Donor” at onboarding.
- Create a donor profile with age, blood group, contact and city.
- View matching open requests in the same city.
- Toggle donor availability.
- Respond “I'm interested” to a matching request.
- See activity in the donor agenda.

### Receiver
- Select “I'm a Receiver” at onboarding.
- Create a receiver profile.
- Publish a request with blood group, units, hospital, city and urgency.
- View matching donor responses and their contact details.
- Mark a request fulfilled or cancelled.
- See requests in the receiver agenda.

### Notification preferences
- Choose Soft chime, Clear bell, Heartbeat pulse, Gentle pop or Silent.
- Test the chosen sound.
- Optional browser notifications can be enabled from the settings panel.
- The sound is generated in the browser using Web Audio. It can only play while the app page is open and the browser allows audio. Browser notifications may require permission and HTTPS (or localhost). On supported browsers, use the browser menu's **Install app** / **Add to Home Screen** option to install Blood Link.

### Optional email alerts
Copy `.env.example` to `.env`, fill in SMTP credentials and restart the server. Never commit `.env` to GitHub.

## Important: prototype and real-world safety
This is a functional educational MVP, not a certified blood-bank or production clinical system.
- Matching uses standard red-cell ABO/Rh donor compatibility as a preliminary filter and exact city matching. It does not establish clinical eligibility or guarantee availability.
- A qualified blood bank or clinician must confirm blood typing, crossmatching, donor eligibility, screening and final suitability.
- Do not delay emergency medical care while using this app. Contact a hospital/blood bank or local emergency service immediately.
- This starter uses local JSON storage and a browser-stored profile ID. It does not yet provide real authentication, verified identities, authorization-grade sessions, encryption at rest, audit logging, abuse protection, backup/retention workflows or production monitoring.
- Before handling real patient/donor data, implement secure authentication, role-based authorization, HTTPS, encryption, rate limiting, audit trails, consent withdrawal/deletion, retention rules, backups and a privacy/security review. Replace JSON storage with a managed database such as PostgreSQL.
- Receiver dashboards show donor phone numbers after an expression of interest. A production version should add explicit donor consent before disclosing contact details and safer in-app contact relay.

## Project layout
```text
blood-link-app/
├── public/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── .env.example
├── .gitignore
├── package.json
├── README.md
└── server.js
```
