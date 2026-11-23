// Arquivos da plataforma: guardados no R2 privado (Cloudflare) quando o backend/.env tem as chaves;
// sem R2 configurado, o original fica no banco (bytea) para não perder o envio.
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const r2Ativo = () => !!(process.env.R2_ENDPOINT && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME);
let cliente = null;
function s3() {
  if (!cliente) {
    cliente = new S3Client({
      region: process.env.R2_REGION || 'auto',
      endpoint: process.env.R2_ENDPOINT,
      credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
    });
  }
  return cliente;
}

async function guardar(chave, buffer, tipo) {
  await s3().send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: chave, Body: buffer, ContentType: tipo || 'application/octet-stream' }));
  return chave;
}
// URL temporária assinada (5 min) — o bucket é privado.
async function urlTemporaria(chave, nome) {
  return getSignedUrl(s3(), new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME, Key: chave,
    ResponseContentDisposition: `attachment; filename="${encodeURIComponent(nome || 'arquivo')}"`,
  }), { expiresIn: 300 });
}
async function remover(chave) {
  try { await s3().send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: chave })); } catch (e) { console.error('[r2] remover:', e.message); }
}

module.exports = { r2Ativo, guardar, urlTemporaria, remover };
