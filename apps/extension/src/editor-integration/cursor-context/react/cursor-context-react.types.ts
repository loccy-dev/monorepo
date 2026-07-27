export enum CursorContextReact {
  JSX_ELEMENT_CONTENT = 'JSX_ELEMENT_CONTENT', // Inside JSX element: <p>|cursor|</p>
  JSX_ATTRIBUTE_VALUE = 'JSX_ATTRIBUTE_VALUE', // Inside JSX attribute: <img alt="|cursor|" />
  JSX_EXPRESSION = 'JSX_EXPRESSION', // Inside JSX expression: <div>{|cursor|}</div>
  STRING_LITERAL = 'STRING_LITERAL', // Inside a string literal in JS/TS
  TEMPLATE_LITERAL = 'TEMPLATE_LITERAL', // Inside template literal: `Hello ${name}`
  OBJECT_PROPERTY = 'OBJECT_PROPERTY', // Object property value
  FUNCTION_CALL = 'FUNCTION_CALL', // Function call argument
  UNKNOWN = 'UNKNOWN',
}
