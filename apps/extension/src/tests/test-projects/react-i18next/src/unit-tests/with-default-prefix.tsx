import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useTranslation, withTranslation, Trans, Translation } from 'react-i18next';

// Component with options in useTranslation
function OptionsComponent() {
  const { t } = useTranslation('translation', { keyPrefix: 'prefix' });
  
  return (
    <div>
      {/* Keys will be prefixed with 'prefix' */}
      <h4>{t('options.title')}</h4>
      <p>{t('options.description')}</p>
      <span>{t('options.nested.deep.key')}</span>
    </div>
  );
}