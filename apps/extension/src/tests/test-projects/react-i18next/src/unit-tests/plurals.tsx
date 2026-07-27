import { useTranslation } from 'react-i18next';

/**
 * Test fixture for plural forms in react-i18next
 */
export function Plurals() {
  const { t } = useTranslation();

  // Basic plurals with count
  const fiveItems = t('item', { count: 5 });

  // Plural with variable count
  const count = 3;
  const dynamicPlural = t('message', { count });

  // Plural with additional interpolation
  const pluralWithParams = t('cart', { count: 2, name: 'John' });
  const dynamicCount = 7
  const pluralWithParamsUnsorted = t('cart', { name: 'John', count: dynamicCount });

  // Context + plural combined
  const maleSingular = t('friend', { context: 'male', count: 1 });
  const femalePlural = t('friend', { context: 'female', count: 3 });

  // Context + plural with extra params
  const contextPluralParams = t('notification', {
    context: 'unread',
    count: 10,
    user: 'Alice'
  });

  // Ordinals (1st, 2nd, 3rd, 4th...)
  const first = t('place', { count: 4, ordinal: true });
  const dynamith = t('place', { count: dynamicCount, ordinal: true });

  // Ordinal with extra params
  const ordinalWithParams = t('ranking', { count: 1, ordinal: true, name: 'Bob' });
  const maleOrdinal = t('finish', { context: 'male', count: 1, ordinal: true });

  return (
    <div></div>
  );
}
