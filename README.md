# 💍 Site de Casamento Personalizável

Recriação do site de casamento (estilo Casar.com) com **painel de administração completo** — tudo editável sem tocar em código.

## Como rodar

```
npm install   (só na primeira vez)
npm start
```

- **Site:** http://localhost:3001
- **Painel de edição:** http://localhost:3001/admin

```
npm test      (roda a suíte de testes)
```

## O que dá pra personalizar no painel

| Aba | O que faz |
|---|---|
| **Geral & Tema** | Nomes do casal, data/hora (contagem regressiva), frase e imagem de fundo do topo, cores do site, fontes e rodapé |
| **Seções do Site** | Ativar/desativar e **reordenar** qualquer seção; editar textos, fotos do casal, padrinhos, locais/horários da cerimônia e recepção (com link do Google Maps) |
| **Presentes** | Adicionar presente colando o **link da loja** — nome, foto e preço são buscados automaticamente quando o site permite; senão, preencha o valor e envie a foto manualmente. Cada presente pode ser ocultado sem excluir. Mostra **quem presenteou** cada item e permite **liberar** o presente de volta para a lista |
| **Confirmações** | Lista de quem confirmou presença (com total de convidados) |
| **Recados** | Mensagens dos convidados, com opção de excluir |

Depois de editar, clique em **💾 Salvar alterações** — o site é atualizado na hora.

## Reserva de presentes pelos convidados

No site, cada presente tem o botão **Presentear**: o convidado vê o link da loja, informa o nome e confirma — o presente fica marcado como **"Presenteado ❤"** e indisponível para os demais. Quem preferir pode marcar *"Prefiro não mostrar meu nome no site"*: o público vê apenas "um convidado", mas o painel mostra o nome real. Se duas pessoas tentarem o mesmo presente ao mesmo tempo, a segunda recebe um aviso amigável. No painel, a aba Presentes mostra quem presenteou e o botão **↩ Liberar** devolve o item à lista.

## Estrutura do projeto

```
server.js               ponto de entrada local (só sobe o app na porta)
api/index.js            ponto de entrada serverless (Vercel)
vercel.json             rewrites e arquivos extras da função no Vercel
data-defaults.json      conteúdo inicial do site (primeira execução)
src/
  app.js                monta o Express: middlewares, static, rotas
  storage.js            persistência em arquivos JSON (uso local e testes)
  supabase.js           persistência no Supabase (produção serverless)
  uploads.js            destino das imagens: disco local ou Supabase Storage
  scraper.js            leitura de links de presentes (og tags, JSON-LD, preço)
  net-guard.js          proteção anti-SSRF (bloqueia IPs privados/localhost)
  middleware.js         Basic Auth opcional + rate limit em memória
  routes/               uma rota por recurso (site, upload, preview, rsvp, messages)
views/
  admin.html            painel de administração (fora de public/ para exigir senha)
public/
  index.html + css/js   site público (renderizado a partir de /api/site)
  css/js do admin       assets do painel
  img/                  imagens padrão que acompanham o projeto
  uploads/              imagens enviadas pelo painel (modo local)
test/
  scraper.test.js       unitários do parser de produtos e do anti-SSRF
  api.test.js           integração: todas as APIs, upload, auth e rate limit
```

## Onde ficam os dados e as imagens

O armazenamento tem **dois modos**, escolhidos automaticamente:

**Modo local** (padrão — rodando na sua máquina):
- **Conteúdo do site:** `data/site.json` (criado de `data-defaults.json` na primeira execução)
- **Confirmações e recados:** `data/rsvps.json` e `data/messages.json`
- **Imagens:** uploads do painel e fotos baixadas de links vão para `public/uploads/`; as imagens padrão do projeto ficam em `public/img/`. Faça backup da pasta `data/` e da `public/uploads/` e você tem o site inteiro.
- Para **resetar o site ao padrão**, apague `data/site.json` e reinicie o servidor.

**Modo Supabase** (produção no Vercel/Netlify, onde o disco é efêmero): definindo as variáveis de ambiente `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`, os dados vão para tabelas do Supabase e as imagens para o Supabase Storage. Veja [Deploy no Vercel](#deploy-no-vercel-grátis-com-supabase) abaixo.
- Para **resetar o site ao padrão**, apague a linha `site` da tabela `documents` (Table Editor do Supabase).

## Deploy no Vercel (grátis, com Supabase)

### 1. Criar o projeto no Supabase

Crie uma conta em [supabase.com](https://supabase.com), crie um projeto e, no **SQL Editor**, rode:

```sql
-- configuração do site (documento único em jsonb)
create table public.documents (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- confirmações de presença e recados (uma linha por item)
create table public.rsvps (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table public.messages (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);

-- o servidor usa a service role key (que ignora RLS);
-- RLS ligado sem políticas bloqueia qualquer acesso pela anon key
alter table public.documents enable row level security;
alter table public.rsvps enable row level security;
alter table public.messages enable row level security;

-- bucket público para as imagens
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', true)
on conflict (id) do nothing;
```

(Se preferir, crie o bucket `uploads` pela interface: **Storage → New bucket**, marcando *Public bucket*.)

Depois anote, em **Project Settings → API**:
- **Project URL** (ex.: `https://abcdefgh.supabase.co`)
- **Service role key** (a chave secreta — nunca a coloque no frontend nem no git)

### 2. Subir o código pro GitHub

```
git add .
git commit -m "Site de casamento"
```

Crie o repositório no GitHub (pode ser privado) e faça o push.

### 3. Criar o projeto no Vercel

1. Em [vercel.com](https://vercel.com), **Add New → Project** e importe o repositório.
2. Framework Preset: **Other** (não precisa de build).
3. Em **Environment Variables**, adicione:
   | Nome | Valor |
   |---|---|
   | `SUPABASE_URL` | a Project URL do passo 1 |
   | `SUPABASE_SERVICE_ROLE_KEY` | a service role key do passo 1 |
   | `ADMIN_PASSWORD` | a senha do painel — **obrigatória em produção**, senão o painel fica aberto |
4. **Deploy**. O site fica em `https://seu-projeto.vercel.app` e o painel em `/admin`.

### Observações de produção

- O conteúdo editado **localmente** (em `data/site.json`) não sobe junto — em produção o site nasce do `data-defaults.json` e você edita pelo painel `/admin`. Se quiser levar o conteúdo local, cole o conteúdo de `data/site.json` na tabela `documents` (key `site`) pelo Table Editor do Supabase.
- Imagens da pasta `public/uploads/` local também não sobem (está no `.gitignore`) — reenvie as fotos pelo painel em produção, que elas irão para o Supabase Storage.
- O rate limit é por instância serverless — em tráfego normal funciona igual; só é menos rígido que no servidor único.

## Segurança

- **Senha do painel (opcional):** sem configuração nenhuma o painel é aberto (uso local). Para proteger, defina a variável de ambiente `ADMIN_PASSWORD` antes de iniciar — o `/admin` e todas as APIs de escrita/administração passam a exigir a senha (usuário pode ser qualquer um):
  ```powershell
  $env:ADMIN_PASSWORD = "sua-senha"; npm start
  ```
- **Anti-SSRF:** a busca de dados de presentes só aceita endereços públicos http/https — IPs privados, localhost e redirecionamentos para redes internas são bloqueados.
- **Uploads:** só imagens (JPG/PNG/WebP/GIF, até 10 MB), gravadas com nome aleatório; o nome original do arquivo nunca chega ao disco.
- **Rate limit:** os formulários públicos (presença e recados) aceitam no máximo 10 envios por minuto por IP.
- **Escrita atômica:** os JSONs são gravados em arquivo temporário e renomeados, evitando corrupção se o processo cair no meio.

## Performance

- Respostas comprimidas com gzip (`compression`).
- Imagens servidas com cache de 1 dia no navegador.
- Fotos do site carregam com `loading="lazy"`.
