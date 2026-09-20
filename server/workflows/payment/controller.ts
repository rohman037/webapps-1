import { Request, Response } from 'express';
import { handleApiError } from '@/server/core/utils/errorHandler';
import {
  getQrisConfigService,
  updateQrisConfigService,
  getAllTransactionsService,
  createTransactionService,
  submitPaymentProofService,
  approveTransactionService,
  rejectTransactionService,
} from './service';

export async function getQrisConfigController(req: Request, res: Response) {
  try {
    const config = await getQrisConfigService();
    return res.json(config);
  } catch (err) {
    return handleApiError(res, err);
  }
}

export async function updateQrisConfigController(req: Request, res: Response) {
  try {
    const config = await updateQrisConfigService(req.body);
    return res.json({ success: true, qrisConfig: config });
  } catch (err) {
    return handleApiError(res, err);
  }
}

export async function getTransactionsController(req: Request, res: Response) {
  try {
    const transactions = await getAllTransactionsService();
    return res.json(transactions);
  } catch (err) {
    return handleApiError(res, err);
  }
}

export async function createTransactionController(req: Request, res: Response) {
  try {
    const accessCodeHeader = req.headers['x-access-code'] as string;
    const transaction = await createTransactionService(req.body, accessCodeHeader);
    return res.json({ success: true, transaction });
  } catch (err) {
    return handleApiError(res, err);
  }
}

export async function submitProofController(req: Request, res: Response) {
  try {
    const { id, proofImageBase64, transaction } = req.body;
    const updatedTrx = await submitPaymentProofService(id, proofImageBase64, transaction);
    return res.json({ success: true, transaction: updatedTrx });
  } catch (err) {
    return handleApiError(res, err);
  }
}

export async function approveTransactionController(req: Request, res: Response) {
  try {
    const { id, accessCode, validUntil, transaction } = req.body;
    const result = await approveTransactionService(id, accessCode, validUntil, transaction);
    return res.json({ success: true, ...result });
  } catch (err) {
    return handleApiError(res, err);
  }
}

export async function rejectTransactionController(req: Request, res: Response) {
  try {
    const { id, rejectReason, transaction } = req.body;
    const updatedTrx = await rejectTransactionService(id, rejectReason, transaction);
    return res.json({ success: true, transaction: updatedTrx });
  } catch (err) {
    return handleApiError(res, err);
  }
}
