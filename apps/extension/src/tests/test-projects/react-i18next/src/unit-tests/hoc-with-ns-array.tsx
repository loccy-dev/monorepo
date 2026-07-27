import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useTranslation, withTranslation, Trans, Translation } from 'react-i18next';

// HOC with multiple namespaces and prefix notation
const HOCMultiNamespace = withTranslation(['ns1', 'ns2'])(({ t }) => (
  <>
    <div>{t('hoc.first', { ns: 'ns1' })}</div>
    <div>{t('hoc.second', {ns:'ns2'})}</div>
    <div>{t('hoc.fallback')}</div>
  </>
));