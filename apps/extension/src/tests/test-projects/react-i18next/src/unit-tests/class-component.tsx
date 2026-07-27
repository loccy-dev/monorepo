import React from 'react';
import { withTranslation } from 'react-i18next';

// Class component with HOC
class ClassComponent extends React.Component<any> {
  componentDidMount() {
    console.log(this.props.t('class.mount'));
  }
  
  render() {
    const { t } = this.props;
    return (
      <>
        <h1>{t('class.title')}</h1>
        <p>{t('class.with.params', { name: 'Alice' })}</p>
      </>
    );
  }
}
const WrappedClass = withTranslation()(ClassComponent);
