require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MercadoPagoConfig, Payment } = require('mercadopago');

const app = express();
// Render define a porta pela variável de ambiente PORT. Este código está correto.
const PORT = process.env.PORT || 4000; 

// É CRÍTICO que a variável FRONTEND_URL seja configurada no ambiente da Render.
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json());

// Validação da variável de ambiente do Access Token
if (!process.env.MP_ACCESS_TOKEN) {
  console.error("ERRO: A variável de ambiente MP_ACCESS_TOKEN não está definida.");
  process.exit(1); // Encerra a aplicação se a variável não estiver presente
}

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
  options: { timeout: 5000 },
});

const payment = new Payment(client);

app.post('/api/create-payment', async (req, res) => {
  const {
    order, payer,
    paymentMethod,
    // Removido 'issuerId' pois não é mais enviado pelo frontend
    token, paymentMethodId, installments 
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
        return res.status(400).json({ error: 'Token e paymentMethodId obrigatórios para pagamento com cartão.' });
      }

      // ===== CORREÇÃO PRINCIPAL AQUI =====
      // O campo 'issuer_id' foi removido do body da requisição,
      // pois o frontend não o envia mais. A SDK do Mercado Pago
      // consegue inferir o emissor a partir do token do cartão.
      const body = {
        transaction_amount: Number(order.totalValue),
        token,
        description: 'Ingressos para evento',
        installments: Number(installments) || 1,
        payment_method_id: paymentMethodId,
        // issuer_id: issuerId, // <-- LINHA REMOVIDA
        payer: { 
          email: payer.email,
          // O CPF já foi usado para gerar o token no frontend,
          // mas pode ser enviado aqui se necessário para análise de risco.
          // identification: {
          //   type: 'CPF',
          //   number: payer.cpf.replace(/\D/g, '')
          // }
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
    const statusCode = error.status || 500;
    const message = error.message || 'Ocorreu um erro interno ao processar o pagamento.';
    return res.status(statusCode).json({ error: message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em ${FRONTEND_URL} e escutando na porta ${PORT}`);
});
