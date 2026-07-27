import { useEffect, useState, useMemo, useCallback } from 'react';
import { useTranslation, Trans } from 'react-i18next';

// Component with default useTranslation
function DefaultComponent() {
  const { t, i18n } = useTranslation();
  const { t: tCommon } = useTranslation('common');
  const { t: ns1 } = useTranslation(['ns1', 'ns2']);

  const [message] = useState(t('state.initial'));
  
  // Basic usage
  const simple = t('simple.key');
  const doubleQuoted = t("double.quoted");
  const templateLiteral = t(`template.literal`);
  
  // With parameters
  const withObject = t('with.object', { user: 'Bob', age: 30 });
                                                  
  const withDefault = t('with.default', 'Default text');
  const withOptions = t('with.options', { ns: 'custom', lng: 'en' });
  
  // Arrays and multiple keys
                                                    
  const withFallback = t('primary.key', { defaultValue: 'fallback' });
  
  // Special characters
  const specialChars = t('special-chars.with-dash');
  const underscore = t('special_underscore');
  const numbers = t('key.123.numbers');
  
  // Dynamic keys
  const dynamicKey = 'dynamic';
  const dynamic = t(dynamicKey);
  const templateDynamic = t(`prefix.${dynamicKey}.suffix`);
  const concatDynamic = t('prefix.' + dynamicKey);

  // Custom-named functions
  const tcm = tCommon('t.common')
  const customNs1 = ns1('custom.ns1')
  const customNs2 = ns1('custom.ns2', {ns: 'ns2'})
  
  // Edge cases
                      
  const whitespace = t('  ');
  const unicode = t('unicode.😀.emoji');
  const escaped = t('escaped\\.dot');
  
  // In hooks
  useEffect(() => {
    console.log(t('effect.mount'));
    return () => console.log(t('effect.cleanup'));
  }, [t]);
  
  const memoized = useMemo(() => t('memo.value'), [t]);
  
  const callback = useCallback((messg: number) => {
    return t('callback.message', { messg });
  }, [t]);
  
  return (
    <div>
      <h1>{t('jsx.title')}</h1>
      <p title={t('jsx.attribute')}>{t('jsx.content')}</p>
      
      {/* In expressions */}
      <span>{`Prefix ${t('jsx.template')} Suffix`}</span>
      <span>{'Start ' + t('jsx.concat') + ' End'}</span>
      <span>{message ? t('jsx.ternary.true') : t('jsx.ternary.false')}</span>
      
      {/* Nested t calls */}
      <p>{t('parent', { param: t('param') })}</p>
      
      {/* Event handlers */}
      <button onClick={() => console.log(t('jsx.onclick'))}>Click</button>
      <input onChange={(e) => alert(t('jsx.onchange'))} />
      
      {/* Map with t */}
      {['item1', 'item2'].map(item => (
        <div key={item}>{t(`jsx.map.${item}`)}</div>
      ))}
      
      {/* Trans component variations */}
      <Trans i18nKey="trans.simple">Default text</Trans>
      <Trans i18nKey="trans.with.components" components={{ bold: <strong /> }}>
        Text with <b>bold</b>
      </Trans>
      <Trans i18nKey={'trans.dynamic.' + dynamicKey} />
      <Trans ns="ns1" i18nKey={`trans.dynamic.${dynamicKey}`} />
    </div>
  );
}