import { redirect } from 'next/navigation';

/**
 * The account area used to be "área dos pais", back when the app was only for
 * children. The page moved to /account; this keeps every bookmark, e-mail link
 * and cached deep link from the old name working.
 */
export default function ParentsAreaRedirect() {
  redirect('/account');
}
