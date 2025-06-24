// server.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MercadoPagoConfig, Payment } = require('mercadopago');

const app = express();
const PORT = process.env.PORT || 4000;

// Garanta que a URL do frontend está no seu arquivo .env
const FRONTEND_URL = process.env.FRONTEND_URL; 
if (!FRONTEND_URL) {
    console.warn("AVISO: A variável de ambiente FRONTEND_URL não está definida.");
}

app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json());

if (!process.env.MP_ACCESS_TOKEN) {
  console.error("ERRO CRÍTICO: A variável de ambiente MP_ACCESS_TOKEN não está definida.");
  process.exit(1);
}

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
  options: { timeout: 5000 },
});

const payment = new Payment(client);

// Rota unificada para criar pagamentos (PIX ou Cartão) via Payment Brick
app.post('/api/create-payment', async (req, res) => {
  const { formData } = req.body;
  const paymentMethod = formData.payment_method_id;

  if (!formData || !paymentMethod) {
    return res.status(400).json({ error: 'Dados da requisição do Brick incompletos.' });
  }

  try {
    let response;
    // Lógica para Pagamento com PIX
    if (paymentMethod === 'pix') {
      const body = {
        transaction_amount: Number(formData.transaction_amount),
        description: 'Ingressos para evento',
        payment_method_id: 'pix',
        payer: {
          email: formData.payer.email,
          first_name: formData.payer.first_name,
          last_name: formData.payer.last_name,
          identification: {
            type: formData.payer.identification.type,
            number: formData.payer.identification.number.replace(/\D/g, '')
          },
        },
      };
      response = await payment.create({ body });
      const tx = response.point_of_interaction.transaction_data;
      return res.status(201).json({
        qrCodeImage: tx.qr_code_base64,
        copyPasteCode: tx.qr_code,
        id: response.id,
        status: response.status,
      });
    } 
    // Lógica para Pagamento com Cartão
    else {
      const body = {
        transaction_amount: Number(formData.transaction_amount),
        token: formData.token,
        description: 'Ingressos para evento',
        installments: Number(formData.installments),
        payment_method_id: formData.payment_method_id,
        issuer_id: formData.issuer_id,
        payer: {
          email: formData.payer.email,
          identification: {
            type: formData.payer.identification.type,
            number: formData.payer.identification.number.replace(/\D/g, ''),
          }
        },
      };
      response = await payment.create({ body });
      return res.status(201).json({
        id: response.id,
        status: response.status,
        status_detail: response.status_detail,
      });
    }

  } catch (error) {
    console.error('Erro ao criar pagamento:', error.cause || error);
    const message = error.cause?.[0]?.description || error.message || 'Ocorreu um erro interno ao processar o pagamento.';
    // O status HTTP 400 é mais apropriado para erros de processamento de pagamento.
    return res.status(400).json({ error: message });
  }
});


app.get('/api/payment-status/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const paymentDetails = await payment.get({ id });
    res.status(200).json({
      id: paymentDetails.id,
      status: paymentDetails.status,
      status_detail: paymentDetails.status_detail,
    });
  } catch (error) {
    console.error(`Erro ao consultar status do pagamento ${id}:`, error);
    const statusCode = error.status || 500;
    const message = 'Erro ao consultar status do pagamento.';
    return res.status(statusCode).json({ error: message });
  }
});


app.listen(PORT, () => {
  console.log(`Servidor rodando e escutando na porta ${PORT}`);
});
