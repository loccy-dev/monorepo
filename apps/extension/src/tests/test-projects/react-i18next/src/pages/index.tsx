import Head from "next/head";
import { Trans, useTranslation } from "react-i18next";

const languages = ['en', 'de', 'ru'] as const;

export default function Home() {
  const { t, i18n } = useTranslation()

  return (
    <>
      <Head>
        <title>react-i18next | Loccy</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div>
        <div style={{ marginBottom: 20 }}>
          {languages.map((lng) => (
            <button
              key={lng}
              onClick={() => i18n.changeLanguage(lng)}
              style={{
                marginRight: 8,
                fontWeight: i18n.language === lng ? 'bold' : 'normal',
              }}
            >
              {lng.toUpperCase()}
            </button>
          ))}
        </div>

        <hr />

        <p>{t('welcomeByName', { name: 'John' })}</p>

        <Trans
          i18nKey="dashboard:linkForMetric"
          values={{ metric: 'Revenue' }}
          components={{ 1: <a href="#" />, 3: <em /> }}
        />

        {/* plurals */}
        <br /><br />
        <p>{t('item', { count: 0 })}</p>
        <p>{t('item', { count: 1 })}</p>
        <p>{t('item', { count: 2 })}</p>
        <p>{t('item', { count: 5 })}</p>
        <br />

        {/* context */}
        <p>{t('context_user')}</p>
        <p>{t('context_user', { context: 'male' })}</p>
        <p>{t('context_user', { context: 'female' })}</p>
        <br />

        {/* context + plurals */}
        <p>{t('context_plural_example', { context: 'male', count: 0 })}</p>
        <p>{t('context_plural_example', { context: 'male', count: 1 })}</p>
        <p>{t('context_plural_example', { context: 'male', count: 2 })}</p>
        <p>{t('context_plural_example', { context: 'male', count: 5 })}</p>
        <br />
        <p>{t('context_plural_example', { context: 'female', count: 0 })}</p>
        <p>{t('context_plural_example', { context: 'female', count: 1 })}</p>
        <p>{t('context_plural_example', { context: 'female', count: 2 })}</p>
        <p>{t('context_plural_example', { context: 'female', count: 5 })}</p>
        <br />
        
        {/* ordinal + context */}
        <p>{t('key', {count: 1, ordinal: true, context: 'male'})}</p>
        <p>{t('key', {count: 2, ordinal: true, context: 'male'})}</p>
        <p>{t('key', {count: 3, ordinal: true, context: 'male'})}</p>
        <p>{t('key', {count: 4, ordinal: true, context: 'male'})}</p>
        <p>{t('key', {count: 1, ordinal: true, context: 'female'})}</p>
        <p>{t('key', {count: 2, ordinal: true, context: 'female'})}</p>
        <p>{t('key', {count: 3, ordinal: true, context: 'female'})}</p>
        <p>{t('key', {count: 4, ordinal: true, context: 'female'})}</p>
        <p>{t('key', {count: 1, ordinal: true})}</p>
        <p>{t('key', {count: 2, ordinal: true})}</p>
        <p>{t('key', {count: 3, ordinal: true})}</p>
        <p>{t('key', {count: 4, ordinal: true})}</p>
        <br />
        
        <p>{t('poweredBy', {ns: 'dashboard'})}</p>
      </div>
    </>
  );
}
