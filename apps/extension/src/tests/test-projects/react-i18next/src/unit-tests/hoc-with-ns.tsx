import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useTranslation, withTranslation, Trans, Translation } from 'react-i18next';

// HOC with namespace
const HOCNamespaced = withTranslation('specific')(({ t }) => (
  <div>{t('hoc.namespaced.key')}</div>
));