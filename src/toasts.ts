import { toast } from 'react-toastify';
import { translateError } from './i18n/catalog';

export async function toastOnError<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error: any) {
    toast.error(translateError(String(error.message)));
    throw error;
  }
}
