require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MercadoPagoConfig, Payment } = require('mercadopago'); 

const app = express();
const PORT = process.env.PORT || 4000;

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

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

// Endpoint para criar pagamento com CARTÃO DE CRÉDITO via Payment Brick
app.post('/api/create-payment', async (req, res) => {
  const paymentData = req.body;

  if (!paymentData.transaction_amount || !paymentData.payer?.email || !paymentData.payment_method_id || !paymentData.token) {
    return res.status(400).json({ error: 'Dados do pagamento com cartão estão incompletos.' });
  }

  try {
    const body = {
      transaction_amount: Number(paymentData.transaction_amount),
      description: 'Ingressos para evento via Cartão',
      payment_method_id: paymentData.payment_method_id,
      payer: {
        email: paymentData.payer.email,
        first_name: paymentData.payer.firstName,
        last_name: paymentData.payer.lastName,
        identification: {
          type: paymentData.payer.identification.type,
          number: paymentData.payer.identification.number.replace(/\D/g, '')
        },
      },
      token: paymentData.token,
      installments: Number(paymentData.installments) || 1,
      issuer_id: paymentData.issuer_id,
    };

    const paymentResponse = await payment.create({ body });
    
    return res.status(201).json({
      id: paymentResponse.id,
      status: paymentResponse.status,
      status_detail: paymentResponse.status_detail,
    });

  } catch (error) {
    console.error('Erro ao criar pagamento com cartão:', error.cause || error);
    const message = error.cause?.[0]?.description || error.message || 'Ocorreu um erro interno ao processar o pagamento.';
    return res.status(400).json({ error: message });
  }
});


// NOVO Endpoint para criar pagamento com PIX
app.post('/api/create-pix-payment', async (req, res) => {
    const { transaction_amount, description, payer } = req.body;

    if (!transaction_amount || !payer?.email) {
        return res.status(400).json({ error: 'Dados para gerar o PIX estão incompletos.' });
    }

    try {
        const body = {
            transaction_amount: Number(transaction_amount),
            description: description || 'Pagamento de Ingressos',
            payment_method_id: 'pix',
            payer: {
                email: payer.email,
                first_name: payer.first_name,
                last_name: payer.last_name,
                identification: {
                    type: payer.identification.type,
                    number: payer.identification.number,
                },
            },
        };

        const pixResponse = await payment.create({ body });
        const pixData = pixResponse.point_of_interaction.transaction_data;
        
        return res.status(201).json({
            id: pixResponse.id,
            status: pixResponse.status, // será 'pending'
            qrCodeImage: pixData.qr_code_base64,
            copyPasteCode: pixData.qr_code,
        });

    } catch (error) {
        console.error('Erro ao criar pagamento PIX:', error.cause || error);
        const message = error.cause?.[0]?.description || error.message || 'Ocorreu um erro interno ao gerar o PIX.';
        return res.status(400).json({ error: message });
    }
});


// Endpoint para verificar o status do pagamento (usado para polling do PIX)
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
        return res.status(statusCode).json({ error: 'Erro ao consultar status do pagamento.' });
    }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando e escutando na porta ${PORT}`);
});
