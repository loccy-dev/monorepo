import { useTranslation } from 'react-i18next';

/**
 * A React component containing examples of various code contexts
 * to be used as a test fixture for context detection and t-func insertion.
 */
export function AllContexts() {
  const { t } = useTranslation();

  // For STRING_LITERAL context
  const myString = 'one';

  // For OBJECT_PROPERTY context
  const myObject = {
    property: 'two',
  };

  // For FUNCTION_CALL context
  const three = (val: string) => `three ${val}`
  three('four');

  return (
    // For *_LITERAL in a JSX attribute
    <div className={`five`} title={'six'} id={"seven"}>

      {/* For JSX_ATTRIBUTE_VALUE (as a string literal) */}
      <h1 title="eight">

        {/* For JSX_ELEMENT_CONTENT */}
        nine
      </h1>

      <p>
        {/* For JSX_EXPRESSION containing a function call */}
        {three('ten')}

        {/* For TEMPLATE_LITERAL containing a variable */}
        {`eleven ${myString}`}
      </p>

      <span>twelve</span>
    </div>
  );
}
