import express from "express";
import cors from "cors";
import { PrismaClient } from "./generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { z, ZodError } from "zod";

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const PORT = 8080;

const app = express();

app.use(cors());
app.use(express.json());

const transactionDto = z.object({
  description: z.string().min(5).max(200),
  amount: z.number().positive(),
  type: z.enum(["entrada", "saida"]),
  status: z.enum(["pendente", "pago", "recebido"]),
  month: z.string(),
});

const statusDto = z.object({
  status: z.enum(["pendente", "pago", "recebido"]),
});

// HOF 1 - filter: filtra transações por tipo
const filterByType = (transactions, type) =>
  transactions.filter((t) => t.type === type);

// HOF 2 - reduce: soma os valores das transações
const sumAmounts = (transactions) =>
  transactions.reduce((acc, t) => acc + t.amount, 0);

// Função recursiva: calcula o saldo acumulado mês a mês
const calcularSaldoAcumulado = (months, index, saldoAnterior) => {
  if (index >= months.length) return [];
  const saldoAtual = saldoAnterior + months[index].saldo;
  return [
    { month: months[index].month, saldoAcumulado: saldoAtual },
    ...calcularSaldoAcumulado(months, index + 1, saldoAtual),
  ];
};

// 0. Resumo financeiro do usuário
app.get("/:user/summary", async (req, res) => {
  const transactions = await prisma.transaction.findMany({
    where: { user: req.params.user },
  });

  const entradas = filterByType(transactions, "entrada");
  const saidas = filterByType(transactions, "saida");

  const totalEntradas = sumAmounts(entradas);
  const totalSaidas = sumAmounts(saidas);

  const meses = [...new Set(transactions.map((t) => t.month))];

  const porMes = meses.map((month) => {
    const doMes = transactions.filter((t) => t.month === month);
    const saldo = sumAmounts(filterByType(doMes, "entrada")) - sumAmounts(filterByType(doMes, "saida"));
    return { month, saldo };
  });

  const saldoAcumulado = calcularSaldoAcumulado(porMes, 0, 0);

  res.json({
    totalEntradas,
    totalSaidas,
    saldo: totalEntradas - totalSaidas,
    saldoAcumulado,
  });
});

// 1. Listar transações de um usuário
app.get("/:user/transactions", async (req, res) => {
  const transactions = await prisma.transaction.findMany({
    where: { user: req.params.user },
  });
  res.json(transactions);
});

// 2. Obter uma transação específica
app.get("/:user/transactions/:id", async (req, res) => {
  const transaction = await prisma.transaction.findFirst({
    where: { id: Number(req.params.id), user: req.params.user },
  });
  res.json(transaction);
});

// 3. Criar uma nova transação
app.post("/:user/transactions", async (req, res) => {
  const data = transactionDto.parse(req.body);
  const transaction = await prisma.transaction.create({
    data: { ...data, user: req.params.user },
  });
  res.status(201).json(transaction);
});

// 4. Atualizar uma transação
app.put("/:user/transactions/:id", async (req, res) => {
  const data = transactionDto.parse(req.body);
  const transaction = await prisma.transaction.update({
    where: { id: Number(req.params.id), user: req.params.user },
    data,
  });
  res.json(transaction);
});

// 5. Atualizar status de uma transação
app.patch("/:user/transactions/:id/update-status", async (req, res) => {
  const { status } = statusDto.parse(req.body);
  const transaction = await prisma.transaction.update({
    where: { id: Number(req.params.id), user: req.params.user },
    data: { status },
  });
  res.json(transaction);
});

// 6. Deletar uma transação
app.delete("/:user/transactions/:id", async (req, res) => {
  const transaction = await prisma.transaction.delete({
    where: { id: Number(req.params.id), user: req.params.user },
  });
  res.json(transaction);
});

app.use((error, req, res, next) => {
  if (error instanceof ZodError) {
    res.status(422).json(error.issues);
    return;
  }
  res.status(422).json({ error: error.message });
});

app.listen(PORT, () =>
  console.log(`Server listening on http://localhost:${PORT}`),
);
