import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useTranslation, withTranslation, Trans, Translation } from 'react-i18next';

// Component with single namespace
function NamespacedComponent() {
  const { t } = useTranslation('namespace');
  
  const basic = t('basic.key')
  const withContext = t("with.context", { context: 'male' });

  const handleClick = () => t(`handle.click`);
  
  return (
    <div>
      <h2>{t('namespaced.title')}</h2>
    </div>
  );
}