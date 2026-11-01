import { useEffect } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { toast } from 'react-toastify';
import { api } from '../../convex/_generated/api';
import { useLocale } from '../i18n/LocaleProvider';

export default function LanguageSwitcher() {
  const { locale, setLocale, t } = useLocale();
  const worldId = useQuery(api.world.defaultWorldStatus)?.worldId;
  const setLanguage = useMutation(api.world.setLanguage);
  useEffect(() => {
    if (worldId) {
      void setLanguage({ worldId, language: locale }).catch(() => toast.error(t('languageFailed')));
    }
  }, [worldId, locale, setLanguage]);
  return (
    <div
      className="language-switcher"
      role="group"
      aria-label={t('language')}
      title={t('languageHint')}
    >
      <button
        type="button"
        lang="zh-CN"
        aria-pressed={locale === 'zh'}
        onClick={() => setLocale('zh')}
      >
        中文
      </button>
      <button
        type="button"
        lang="en"
        aria-pressed={locale === 'en'}
        onClick={() => setLocale('en')}
      >
        English
      </button>
    </div>
  );
}
