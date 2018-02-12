import * as syntaxes from 'mdn-data/css/syntaxes.json';
import * as cssTypes from 'mdn-data/css/types.json';
import {
  Combinator,
  Component,
  ComponentType,
  Entity,
  EntityType,
  ICombinator,
  IFunction,
  IMultiplierQurlyBracet,
  Multiplier,
  MultiplierType,
} from './parser';

export enum Type {
  Alias,
  DataType,
  Length,
  StringLiteral,
  NumericLiteral,
  String,
  Number,
}

interface IBasic {
  type: Type.String | Type.Number | Type.Length;
}

export interface IAlias {
  type: Type.Alias;
  name: string;
  generics: IGenerics[];
}

export interface IGenerics {
  name: string;
  defaults?: string;
}

export interface IDataType {
  type: Type.DataType;
  name: string;
}

export interface IStringLiteral {
  type: Type.StringLiteral;
  literal: string;
}

interface INumericLiteral {
  type: Type.NumericLiteral;
  literal: number;
}

// Yet another reminder; naming is hard
export type TypeType<TAlias = IDataType> = IBasic | IStringLiteral | INumericLiteral | TAlias;

const basicDataTypes = [...Object.keys(cssTypes), 'hex-color'].reduce<{
  [name: string]: IBasic;
}>((dataTypes, name) => {
  switch (name) {
    case 'number':
    case 'integer':
      dataTypes[name] = {
        type: Type.Number,
      };
      break;
    case 'length':
      dataTypes[name] = {
        type: Type.Length,
      };
      break;
    default:
      if (!(name in syntaxes)) {
        dataTypes[name] = {
          type: Type.String,
        };
      }
  }
  return dataTypes;
}, {});

export default function typing(entities: EntityType[]): TypeType[] {
  const types: TypeType[] = [];
  let hasLength = false;
  let hasString = false;
  let hasNumber = false;
  for (const entity of entities) {
    if (isComponent(entity)) {
      if (shouldIncludeComponent(entity)) {
        switch (entity.component) {
          case Component.Keyword:
            if (String(Number(entity.value)) === entity.value) {
              addNumericLiteral(Number(entity.value));
            } else {
              addStringLiteral(entity.value);
            }
            break;
          case Component.DataType: {
            const value = entity.value.slice(1, -1);
            if (value.indexOf("'") === 0) {
              // Lets skip these for now
              addString();
            } else if (value in basicDataTypes) {
              add(basicDataTypes[value]);
            } else {
              addDataType(value);
            }
            break;
          }
          case Component.Group: {
            if (entity.multiplier) {
              if (
                (isQurlyBracetMultiplier(entity.multiplier) &&
                  (entity.multiplier.min > 1 || entity.multiplier.max === 1)) ||
                entity.multiplier.sign === Multiplier.Asterisk ||
                entity.multiplier.sign === Multiplier.PlusSign ||
                entity.multiplier.sign === Multiplier.HashMark ||
                entity.multiplier.sign === Multiplier.ExclamationPoint
              ) {
                addString();
              }
            }

            for (const type of typing(entity.entities)) {
              add(type);
            }
          }
        }
      }
    } else if (isCombinator(entity)) {
      if (entity.combinator === Combinator.DoubleBar || isMandatoryCombinator(entity)) {
        addString();
      }
    } else if (isFunction(entity)) {
      addString();
    }
  }

  function addLength() {
    if (!hasLength) {
      types.push({
        type: Type.Length,
      });
      hasLength = true;
    }
  }

  function addString() {
    if (!hasString) {
      types.push({
        type: Type.String,
      });
      hasString = true;
    }
  }

  function addNumber() {
    if (!hasNumber) {
      types.push({
        type: Type.Number,
      });
      hasNumber = true;
    }
  }

  function addStringLiteral(literal: string) {
    if (types.every(type => !(type.type === Type.StringLiteral && type.literal === literal))) {
      types.push({
        type: Type.StringLiteral,
        literal,
      });
    }
  }

  function addNumericLiteral(literal: number) {
    if (types.every(type => !(type.type === Type.NumericLiteral && type.literal === literal))) {
      types.push({
        type: Type.NumericLiteral,
        literal,
      });
    }
  }

  function addDataType(name: string) {
    if (types.every(type => !(type.type === Type.DataType && type.name === name))) {
      types.push({
        type: Type.DataType,
        name,
      });
    }
  }

  function add(type: TypeType) {
    switch (type.type) {
      case Type.Length: {
        addLength();
        break;
      }
      case Type.String: {
        addString();
        break;
      }
      case Type.Number: {
        addNumber();
        break;
      }
      case Type.StringLiteral: {
        addStringLiteral(type.literal);
        break;
      }
      case Type.NumericLiteral: {
        addNumericLiteral(type.literal);
        break;
      }
      case Type.DataType: {
        addDataType(type.name);
        break;
      }
    }
  }

  function previousEntity(currentEntity: EntityType) {
    return entities[entities.indexOf(currentEntity) - 1];
  }

  function nextEntity(currentEntity: EntityType) {
    return entities[entities.indexOf(currentEntity) + 1];
  }

  function previousComponentWasOptional(combinator: ICombinator) {
    const component = previousEntity(combinator);
    return !!component && isComponent(component) && isOptionalComponent(component);
  }

  function nextComponentIsOptional(combinator: ICombinator) {
    const component = nextEntity(combinator);
    return !!component && isComponent(component) && isOptionalComponent(component);
  }

  function shouldIncludeComponent(entity: ComponentType) {
    const nextCombinator = nextEntity(entity);
    if (nextCombinator && isCombinator(nextCombinator) && isMandatoryCombinator(nextCombinator)) {
      return nextComponentIsOptional(nextCombinator);
    }
    const previousCombinator = previousEntity(entity);
    if (previousCombinator && isCombinator(previousCombinator) && isMandatoryCombinator(previousCombinator)) {
      return previousComponentWasOptional(previousCombinator);
    }
    return true;
  }

  return types;
}

function isFunction(entity: EntityType): entity is IFunction {
  return entity.entity === Entity.Function;
}

function isComponent(entity: EntityType): entity is ComponentType {
  return entity.entity === Entity.Component;
}

function isCombinator(entity: EntityType): entity is ICombinator {
  return entity.entity === Entity.Combinator;
}

function isQurlyBracetMultiplier(multiplier: MultiplierType): multiplier is IMultiplierQurlyBracet {
  return multiplier.sign === Multiplier.QurlyBracet;
}

function isMandatoryCombinator({ combinator }: ICombinator) {
  return combinator === Combinator.DoubleAmpersand || combinator === Combinator.Juxtaposition;
}

function isOptionalComponent(component: ComponentType) {
  return (
    component.multiplier &&
    ((isQurlyBracetMultiplier(component.multiplier) && component.multiplier.min > 0) ||
      component.multiplier.sign === Multiplier.Asterisk ||
      component.multiplier.sign === Multiplier.QuestionMark)
  );
}
