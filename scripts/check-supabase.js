/**
 * Diagnóstico da conexão com o Supabase — identifica o tipo da chave
 * e testa gravar/ler/apagar na tabela documents, igual o site faz.
 *
 * Uso:  node scripts/check-supabase.js <SUPABASE_URL> <CHAVE>
 */
const { createClient } = require('@supabase/supabase-js');

const [url, key] = process.argv.slice(2);
if (!url || !key) {
  console.log('Uso: node scripts/check-supabase.js <SUPABASE_URL> <CHAVE>');
  process.exit(1);
}

function tipoDaChave(k) {
  if (k.startsWith('sb_secret_')) {
    return { ok: true, desc: 'Chave secreta nova (sb_secret_...) — é o tipo certo. ✔' };
  }
  if (k.startsWith('sb_publishable_')) {
    return {
      ok: false,
      desc:
        'Chave PUBLISHABLE — essa é a chave PÚBLICA, tipo errado. ✘\n' +
        '  Copie a "Secret key" (sb_secret_...) em Project Settings → API Keys.',
    };
  }
  if (k.startsWith('eyJ')) {
    try {
      const payload = JSON.parse(Buffer.from(k.split('.')[1], 'base64url').toString('utf8'));
      if (payload.role === 'service_role') {
        return { ok: true, desc: 'JWT service_role (legado) — é o tipo certo. ✔' };
      }
      return {
        ok: false,
        desc:
          `JWT com role "${payload.role}" — tipo errado (essa é a chave pública "anon"). ✘\n` +
          '  Copie a service_role na aba "Legacy API keys", ou uma sb_secret_ em "API Keys".',
      };
    } catch {
      return { ok: false, desc: 'Parece um JWT mas não consegui decodificar — confira se copiou inteira.' };
    }
  }
  return { ok: false, desc: 'Formato de chave não reconhecido — confira se copiou a chave inteira.' };
}

async function main() {
  console.log('URL do projeto :', url);
  console.log('Chave (mascarada):', key.slice(0, 12) + '...' + key.slice(-4), `(${key.length} caracteres)`);

  const tipo = tipoDaChave(key);
  console.log('Tipo da chave  :', tipo.desc);
  if (!tipo.ok) process.exit(1);

  const client = createClient(url, key, { auth: { persistSession: false } });
  const teste = { key: '__diagnostico__', value: { ok: true } };

  const ins = await client.from('documents').upsert(teste);
  if (ins.error) {
    console.log('Gravação       : FALHOU ✘ →', ins.error.message);
    console.log('\nSe a mensagem fala de row-level security, a chave não é a secreta deste projeto.');
    console.log('Se fala que a tabela não existe, rode o SQL de criação das tabelas (README).');
    process.exit(1);
  }
  console.log('Gravação       : OK ✔');

  const sel = await client.from('documents').select('value').eq('key', '__diagnostico__').maybeSingle();
  console.log('Leitura        :', sel.error ? 'FALHOU ✘ → ' + sel.error.message : 'OK ✔');

  const del = await client.from('documents').delete().eq('key', '__diagnostico__');
  console.log('Exclusão       :', del.error ? 'FALHOU ✘ → ' + del.error.message : 'OK ✔');

  if (!sel.error && !del.error) {
    console.log('\nTudo certo! Essa URL + chave funcionam. Se o site ainda dá erro, o valor no Vercel');
    console.log('está diferente desses — edite a variável (ambiente Production) e faça REDEPLOY.');
  }
}

main().catch((err) => {
  console.error('Erro inesperado:', err.message);
  process.exit(1);
});
