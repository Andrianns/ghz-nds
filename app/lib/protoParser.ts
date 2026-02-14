
import protobuf from 'protobufjs';

export interface MethodDefinition {
  name: string;
  requestType: string;
}

export interface ServiceDefinition {
  name: string;
  methods: MethodDefinition[];
}

export interface ParsedProto {
  services: ServiceDefinition[];
  messageDefaults: Record<string, any>;
}

export function parseProtoContent(content: string): ParsedProto {
  try {
    const root = new protobuf.Root();

    // Pre-define common google types using a string parse to avoid object construction issues
    const commonProto = `
      syntax = "proto3";
      package google.protobuf;
      message Empty {}
      message Timestamp { int64 seconds = 1; int32 nanos = 2; }
      message Duration { int64 seconds = 1; int32 nanos = 2; }
      message DoubleValue { double value = 1; }
      message FloatValue { float value = 1; }
      message Int64Value { int64 value = 1; }
      message UInt64Value { uint64 value = 1; }
      message Int32Value { int32 value = 1; }
      message UInt32Value { uint32 value = 1; }
      message BoolValue { bool value = 1; }
      message StringValue { string value = 1; }
      message BytesValue { bytes value = 1; }
    `;

    protobuf.parse(commonProto, root);

    // Parse with the pre-filled root
    // options: { keepCase: true } ?
    protobuf.parse(content, root);

    const services: ServiceDefinition[] = [];
    const messageDefaults: Record<string, any> = {};

    // Helper to generate default values for a message type
    function getMessageDefaults(type: protobuf.Type): any {
      const defaults: any = {};
      type.fieldsArray.forEach(field => {
        if (field.repeated) {
          defaults[field.name] = [];
        } else if (field.resolvedType instanceof protobuf.Type) {
          // Nested message
          defaults[field.name] = getMessageDefaults(field.resolvedType);
        } else if (field.resolvedType instanceof protobuf.Enum) {
          // Enum default
          const keys = Object.keys(field.resolvedType.values);
          // Usually first is default, or 0
          defaults[field.name] = keys.length > 0 ? keys[0] : 0;
        } else {
          // Scalar types
          switch (field.type) {
            case 'string': defaults[field.name] = ""; break;
            case 'bool': defaults[field.name] = false; break;
            case 'double':
            case 'float':
            case 'int32':
            case 'uint32':
            case 'sint32':
            case 'fixed32':
            case 'sfixed32':
            case 'int64':
            case 'uint64':
            case 'sint64':
            case 'fixed64':
            case 'sfixed64': defaults[field.name] = 0; break;
            default: defaults[field.name] = null; break;
          }
        }
      });
      return defaults;
    }

    // First pass mainly to resolve types if needed, but protobufjs does it internally usually if we call resolveAll
    root.resolveAll();

    function visit(node: any, path: string) {
      if (node instanceof protobuf.Service) {
        services.push({
          name: path.slice(0, -1),
          methods: node.methodsArray.map((m: any) => ({
            name: m.name,
            requestType: m.requestType
          }))
        });
      } else if (node.nested) {
        Object.keys(node.nested).forEach(key => {
          visit(node.nested[key], path + key + ".");
        });
      }
    }

    visit(root, "");

    // Generate defaults for all types found in services
    // Better strategy: Just iterate all types in root? Or lazily?
    // Let's iterate all nested types to build the dictionary
    function collectTypes(node: any) {
      if (node instanceof protobuf.Type) {
        messageDefaults[node.name] = getMessageDefaults(node);
        // Also store key with full path if needed?
        // protobufjs .resolveType usage in lookup
      }
      if (node.nested) {
        Object.keys(node.nested).forEach(key => collectTypes(node.nested[key]));
      }
    }
    collectTypes(root);

    // Fallback: Ensure we can lookup by simple name if unique, 
    // but correctly we should use what the method definition says (usually simple name if in same package, or FQN)

    // Let's refine the messageDefaults to address FQN
    // But for now, simple name matching might suffice or we do a lookup when we parse the method.

    return { services, messageDefaults };
  } catch {
    return { services: [], messageDefaults: {} };
  }
}
