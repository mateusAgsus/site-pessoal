// Entrada serverless (Vercel): o app Express inteiro vira uma função.
// Os arquivos estáticos de public/ são servidos pela CDN do Vercel
// antes de chegar aqui (ver rewrites em vercel.json).
const createApp = require('../src/app');

module.exports = createApp();
