import { SignInButton } from '@clerk/clerk-react';
import { useLocale } from '../../i18n/LocaleProvider';

export default function LoginButton() {
  const { t } = useLocale();
  return (
    <SignInButton>
      <button className="button text-white shadow-solid">
        <div className="inline-block bg-clay-700">
          <span>{t('login')}</span>
        </div>
      </button>
    </SignInButton>
  );
}
