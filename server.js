require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MercadoPagoConfig, Payment } = require('mercadopago');

const app = express();
const PORT = process.env.PORT || 4000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json());

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
  options: { timeout: 5000 },
});
const payment = new Payment(client);

app.post('/api/create-payment', async (req, res) => {
  const {
    order, payer,
    paymentMethod,
    token, paymentMethodId, issuerId, installments
  } = req.body;

  if (!order?.totalValue || !payer?.email || !paymentMethod) {
    return res.status(400).json({ error: 'Dados da requisição incompletos.' });
  }

  try {
    if (paymentMethod === 'pix') {
      const body = {
        transaction_amount: order.totalValue,
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
        return res.status(400).json({ error: 'Token e paymentMethodId obrigatórios.' });
      }
      const body = {
        transaction_amount: order.totalValue,
        token,
        description: 'Ingressos para evento',
        installments: Number(installments) || 1,
        payment_method_id: paymentMethodId,
        issuer_id: issuerId,
        payer: { email: payer.email },
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
    console.error('Erro ao criar pagamento:', error);
    const statusCode = error.status >= 400 && error.status < 600 ? error.status : 500;
    return res.status(statusCode).json({
      error: error.message || 'Erro interno.'
    });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
