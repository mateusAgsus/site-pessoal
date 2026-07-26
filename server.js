const createApp = require('./src/app');

const PORT = process.env.PORT || 3000;

createApp().listen(PORT, () => {
  console.log(`✔ Site:  http://localhost:${PORT}`);
  console.log(`✔ Admin: http://localhost:${PORT}/admin`);
  if (!process.env.ADMIN_PASSWORD) {
    console.log('ℹ Painel sem senha (uso local). Defina ADMIN_PASSWORD para proteger o /admin.');
  }
});
