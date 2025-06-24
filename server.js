require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MercadoPagoConfig, Payment } = require('mercadopago');

const app = express();
const PORT = process.env.PORT || 4000;

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

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

app.post('/api/create-payment', async (req, res) => {
  // Recebe issuerId do frontend
  const {
    order, payer, paymentMethod,
    token, paymentMethodId, installments, issuerId 
  } = req.body;

  if (!order?.totalValue || !payer?.email || !paymentMethod) {
    return res.status(400).json({ error: 'Dados da requisição incompletos.' });
  }

  try {
    if (paymentMethod === 'pix') {
      const body = {
        transaction_amount: Number(order.totalValue),
        description: 'Ingressos para evento',
        payment_method_id: 'pix',
        payer: {
          email: payer.email,
          first_name: payer.fullName,
          identification: {
            type: 'CPF',
            number: payer.cpf.replace(/\D/g, '')
          },
        },
      };
      const response = await payment.create({ body });
      const tx = response.point_of_interaction.transaction_data;
      return res.status(201).json({
        qrCodeImage: tx.qr_code_base64,
        copyPasteCode: tx.qr_code,
        id: response.id,
        status: response.status,
      });

    } else if (paymentMethod === 'card') {
      if (!token || !paymentMethodId) {
        return res.status(400).json({ error: 'Token e método de pagamento são obrigatórios para pagamento com cartão.' });
      }

      const body = {
        transaction_amount: Number(order.totalValue),
        token,
        description: 'Ingressos para evento',
        installments: Number(installments) || 1,
        payment_method_id: paymentMethodId,
        issuer_id: issuerId, // Repassa o issuer_id para a API do Mercado Pago
        payer: { 
          email: payer.email,
          identification: {
            type: payer.identification.type,
            number: payer.identification.number.replace(/\D/g, '')
          }
        },
      };
      
      const response = await payment.create({ body });
      return res.status(201).json({
        id: response.id,
        status: response.status,
        status_detail: response.status_detail,
      });

    } else {
      return res.status(400).json({ error: 'Método de pagamento não suportado.' });
    }
  } catch (error) {
    console.error('Erro ao criar pagamento:', error.cause || error);
    // Retorna a mensagem de erro específica do Mercado Pago, se disponível
    const message = error.cause?.[0]?.description || error.message || 'Ocorreu um erro interno ao processar o pagamento.';
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
