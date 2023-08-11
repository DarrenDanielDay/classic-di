/**
 * @license MIT
 * Copyright (C) 2022  DarrenDanielDay <Darren_Daniel_Day@hotmail.com>
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
/// <reference types="typescript/lib/lib.esnext.decorators.d.ts" />
export interface Token<T> {
  readonly type: "token";
  readonly key: symbol;
  /**
   * The default implementation.
   */
  readonly default?: T;
}

/**
 * Create a token. Each token has a unique symbol key.
 * @param name display name for this dependency
 * @param impl optional default implementation
 */
export const token = <T>(name: string, impl?: T): Token<T> => ({
  type: "token",
  key: Symbol(name),
  default: impl,
});

/**
 * The internal symbol key for decorator metadata.
 */
export const $metadata = Symbol.for("classic-di-metadata");

export interface InjectableMeta<T, D extends readonly Token<any>[] = readonly []> {
  implements?: Token<T>;
  requires?: D;
}

interface Constructor<T = any, P extends readonly any[] = readonly any[]> {
  new (...args: P): T;
  [Symbol.metadata]?: {
    [$metadata]?: InjectableMeta<any, Token<any>[]>;
  } | null;
}

type MapTokensToParams<D extends readonly Token<any>[]> = {
  [K in keyof D]: D[K] extends Token<infer I> ? I : never;
};

/**
 * Class decorator for injectable classes. Declares the dependencies and the implementation of the class.
 * @param meta metadata
 */
export const Injectable = <T, D extends readonly Token<any>[] = readonly []>(meta: InjectableMeta<T, D>) => {
  return <C extends Constructor<T, MapTokensToParams<D>>>(_target: C, context: ClassDecoratorContext<C>) => {
    context.metadata[$metadata] = meta;
  };
};

export enum ResolveNodeType {
  Create,
  Instance,
  Reference,
}

type CreateNode = {
  type: ResolveNodeType.Create;
  owner: Container;
  /**
   * When the `ctor` is not an implementation constructor, `token` will be null.
   */
  token: Token<any> | null;
  ctor: Constructor<any>;
  deps: Token<any>[];
  instance?: any;
};

type InstanceNode = {
  type: ResolveNodeType.Instance;
  token: Token<any>;
  owner: Container;
  instance: any;
};

type ReferenceNode = {
  type: ResolveNodeType.Reference;
  token: Token<any>;
  owner: Container;
  node: CreateNode;
};

export type ResolveNode = InstanceNode | CreateNode | ReferenceNode;

type ResolveStackState = {
  node: CreateNode;
  index: number;
};

export type CircularResolution = {
  circular: true;
  begin: number;
  path: CreateNode[];
};

export interface NormalResolution {
  circular: false;
  path: ResolveNode[];
}

export type Resolution = NormalResolution | CircularResolution;
/**
 * @internal
 */
const enum ResolveContextState {
  Resolving = 1,
  Resolved = 2,
}
/**
 * @internal
 */
type ResolveContext =
  | {
      state: ResolveContextState.Resolving;
      index: number;
      node: CreateNode;
    }
  | {
      state: ResolveContextState.Resolved;
      node: CreateNode;
    };

export interface ContainerInit {
  parent?: Container;
  name?: string;
}

/**
 * The IoC container.
 */
export class Container {
  #injectables = new Map<symbol, Constructor>();
  #instances = new Map<symbol, any>();
  #parent?: Container;
  name?: string;
  constructor(init?: ContainerInit) {
    this.#parent = init?.parent;
    this.name = init?.name;
  }

  register<T>(constructor: Constructor<T>) {
    const meta = this.#getMeta(constructor);
    if (!meta) {
      throw new Error(
        `No metadata found on ${constructor.name}.  Forgot to decorate with "Injectable" or polyfill "Symbol.metadata"?`
      );
    }
    const token = meta.implements;
    if (!token) {
      throw new Error(`Implementation token is required.`);
    }
    const { key } = token;
    if (this.#injectables.has(key)) {
      throw new Error(`Cannot register "${key.description}" twice.`);
    }
    this.#injectables.set(key, constructor);
  }

  resolve(target: Token<any> | Constructor): Resolution {
    const resolveContext = new Map<symbol, ResolveContext>();
    const firstNode = this.#resolveFirstNode(target);
    if (firstNode.type === ResolveNodeType.Instance) {
      return {
        circular: false,
        path: [firstNode],
      };
    } else {
      const { token } = firstNode;
      if (token) {
        resolveContext.set(token.key, {
          state: ResolveContextState.Resolving,
          index: 0,
          node: firstNode,
        });
      }
    }
    const resolveStack: ResolveStackState[] = [{ node: firstNode, index: -1 }];
    // true means resolving, `create` node means resolved.
    // Saves the iteration sequence.
    const resolvePath: ResolveNode[] = [];
    for (let state = resolveStack.at(-1); state; state = resolveStack.at(-1)) {
      const { node } = state;
      const index = ++state.index;
      const { deps, token } = node;
      if (index === deps.length) {
        // all dependencies resolved
        resolvePath.push(node);
        resolveStack.pop();
        if (token) {
          resolveContext.set(token.key, {
            state: ResolveContextState.Resolved,
            node,
          });
        }
      } else {
        const dependency = deps[index];
        const { key } = dependency;
        const context = resolveContext.get(key);
        if (context) {
          if (context.state === ResolveContextState.Resolving) {
            const path = resolveStack.map((state) => state.node);
            path.push(context.node);
            return {
              circular: true,
              begin: context.index,
              path,
            };
          } else {
            resolvePath.push({
              type: ResolveNodeType.Reference,
              owner: this,
              // token must be present
              token: token!,
              node: context.node,
            });
            continue;
          }
        }
        const resolved = this.#resolveNode(dependency);
        if (resolved.type === ResolveNodeType.Instance) {
          resolvePath.push(resolved);
        } else {
          resolveContext.set(key, {
            state: ResolveContextState.Resolving,
            index: resolveStack.length,
            node: resolved,
          });
          resolveStack.push({
            node: resolved,
            index: -1,
          });
        }
      }
    }
    return {
      circular: false,
      path: resolvePath,
    };
  }

  create<T = any>(path: ResolveNode[]): T {
    const stack: any[] = [];
    for (let i = 0, l = path.length; i < l; i++) {
      const node = path[i];
      if (node.type === ResolveNodeType.Instance) {
        stack.push(node.instance);
      } else if (node.type === ResolveNodeType.Create) {
        const {
          ctor,
          deps: { length },
          owner,
          token,
        } = node;
        const params = stack.slice(stack.length - length);
        const instance = owner.createInstance(ctor, params);
        if (token) {
          owner.#instances.set(token.key, instance);
        }
        stack.length -= length;
        stack.push(instance);
        node.instance = instance;
      } else if (node.type === ResolveNodeType.Reference) {
        stack.push(node.node.instance);
      }
    }
    return stack[0];
  }

  get<T>(token: Token<T>): T {
    return this.#resolveAndCreate(token);
  }

  consume<T>(consumer: Constructor<T>): T {
    return this.#resolveAndCreate(consumer);
  }

  protected createInstance(ctor: Constructor, params: any[]): any {
    return Reflect.construct(ctor, params);
  }

  #getMeta<T>(constructor: Constructor<T>): InjectableMeta<T, Token<any>[]> | undefined {
    return constructor[Symbol.metadata]?.[$metadata];
  }

  #resolveFirstNode(target: Token<any> | Constructor): CreateNode | InstanceNode {
    if (typeof target === "function") {
      const meta = this.#getMeta(target);
      if (!meta) {
        throw new Error(`Injectable metadata not found on "${target.name}".`);
      }
      const { implements: _implements } = meta;
      if (_implements) {
        if (this.#injectables.get(_implements.key) === target) {
          return this.#resolveNode(_implements);
        }
      }
      return {
        type: ResolveNodeType.Create,
        owner: this,
        token: null,
        ctor: target,
        deps: meta.requires ?? [],
      };
    }
    return this.#resolveNode(target);
  }

  #resolveNode(token: Token<any>): CreateNode | InstanceNode {
    const { key } = token;
    const instance = this.#instances.get(key);
    if (instance) {
      return {
        type: ResolveNodeType.Instance,
        token,
        owner: this,
        instance,
      };
    }
    const injectable = this.#injectables.get(key);
    if (injectable) {
      return {
        type: ResolveNodeType.Create,
        token,
        owner: this,
        ctor: injectable,
        deps: this.#getMeta(injectable)!.requires ?? [],
      };
    }
    const defaultImpl = token.default;
    if (defaultImpl) {
      return {
        type: ResolveNodeType.Instance,
        token,
        owner: this,
        instance: defaultImpl,
      };
    }
    const parent = this.#parent;
    if (!parent) {
      throw new Error(`Cannot resolve "${key.description}".`);
    }
    return parent.#resolveNode(token);
  }

  #resolveAndCreate(token: Token<any> | Constructor) {
    const resolved = this.resolve(token);
    if (resolved.circular) {
      throw new CircularDependencyError(resolved);
    }
    return this.create(resolved.path);
  }
}

export class CircularDependencyError extends Error {
  constructor(public resolution: CircularResolution) {
    super(
      `Circular dependency: ${resolution.path
        .map((node, i) => {
          const description = node.token?.key.description;
          return `${i === resolution.begin ? "{{ " : ""}[${description ? `<${description}> ` : ""}${node.ctor.name}]`;
        })
        .join(" -> ")} }}`
    );
  }
}
