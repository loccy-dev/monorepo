import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useTranslation, withTranslation, Trans, Translation } from 'react-i18next';

// Translation render prop component
function RenderPropComponent() {
  return (
    <>
      <Translation>
        {
          (t, { i18n }) => <p>{t('translation.render.default')}</p>
        }
      </Translation>
      <Translation ns="custom">
        {(t) => <p>{t('translation.render.custom')}</p>}
      </Translation>
      <Translation ns={['ns1', 'ns2']}>
        {(t) => (
          <>
            <p>{t('translation.render.multi')}</p>
            <p>{t('translation.specific', { ns: 'ns2' })}</p>
          </>
        )}
      </Translation>
    </>
  );
}