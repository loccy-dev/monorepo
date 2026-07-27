import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useTranslation, withTranslation, Trans, Translation } from 'react-i18next';

// Component with multiple namespaces
function MultiNamespaceComponent() {
  const { t } = useTranslation(['ns1', 'ns2']);
  
  const veryLong = t('very.long.key.that.continues.for.testing.purposes');
  
  // Using namespace prefix notation
  const fromNs1 = t('ns1:first.namespace.key');
  const fromNs2 = t('second.namespace.key', {ns: 'ns2'});
  
  return (
    <div>
      <h3>{t('multi.title')}</h3>
      <p>{t('multi.subtitle', {ns: 'ns2'})}</p>
      <div>{fromNs1}</div>
      <div>{fromNs2}</div>
    </div>
  );
}