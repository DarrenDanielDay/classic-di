import "./polyfill.js";
import { CircularDependencyError, Container, Injectable, ResolveNodeType, Resolution, token } from "./index.js";
interface Dep1 {
  foo(): number;
}
interface Dep2 {
  bar(): string;
}
interface Dep3 {
  baz(): boolean;
}
const dep1 = token<Dep1>("dep1");
const dep2 = token<Dep2>("dep2");
const dep3 = token<Dep3>("dep3");

function chained() {
  @Injectable({
    implements: dep1,
  })
  class A implements Dep1 {
    foo() {
      return 666;
    }
  }
  @Injectable({
    implements: dep2,
    requires: [dep1],
  })
  class B implements Dep2 {
    constructor(public dep1: Dep1) {}
    bar() {
      return this.dep1.foo().toString();
    }
  }
  @Injectable({
    implements: dep3,
    requires: [dep2],
  })
  class C implements Dep3 {
    constructor(public dep2: Dep2) {}
    baz(): boolean {
      return this.dep2.bar() === "666";
    }
  }
  return [A, B, C] as const;
}

function reused() {
  @Injectable({
    implements: dep1,
  })
  class A implements Dep1 {
    foo() {
      return 666;
    }
  }
  @Injectable({
    implements: dep2,
    requires: [dep1],
  })
  class B implements Dep2 {
    constructor(public dep1: Dep1) {}
    bar() {
      return this.dep1.foo().toString();
    }
  }
  @Injectable({
    implements: dep3,
    requires: [dep1, dep2] as const,
  })
  class C implements Dep3 {
    constructor(public dep1: Dep1, public dep2: Dep2) {}
    baz(): boolean {
      return this.dep2.bar() === "666";
    }
  }
  return [A, B, C] as const;
}
function circular() {
  @Injectable({
    implements: dep1,
    requires: [dep3],
  })
  class A implements Dep1 {
    constructor(public dep3: Dep3) {}
    foo(): number {
      return this.dep3.baz() ? 1 : 0;
    }
  }
  @Injectable({
    implements: dep2,
    requires: [dep1],
  })
  class B implements Dep2 {
    constructor(public dep1: Dep1) {}
    bar(): string {
      return this.dep1.foo().toString();
    }
  }
  @Injectable({
    implements: dep3,
    requires: [dep2],
  })
  class C implements Dep3 {
    constructor(public dep2: Dep2) {}
    baz(): boolean {
      return this.dep2.bar() === "1";
    }
  }
  return [A, B, C] as const;
}

describe("token", () => {
  it("should be unique", () => {
    expect(token("foo")).not.toStrictEqual(token("foo"));
  });
});

describe("Injectable", () => {
  it("should emit error if `Symbol.metadata` not polyfilled", () => {
    expect(() => {
      Injectable({})(class {}, {
        kind: "class",
        name: "foo",
        // @ts-expect-error undefined when not polyfilled
        metadata: undefined,
        addInitializer() {},
      });
    }).toThrow(/polyfill/);
  });
});

describe("Container", () => {
  describe("add", () => {
    it("should use added instance", () => {
      const container = new Container();
      const instance: Dep1 = {
        foo() {
          return 1;
        },
      };
      container.add(dep1, instance);
      expect(container.get(dep1)).toBe(instance);
    });
    it("should emit error when instance exist", () => {
      const container = new Container();
      container.add(dep1, {
        foo() {
          return 1;
        },
      });
      expect(() => {
        container.add(dep1, {
          foo() {
            return 2;
          },
        });
      }).toThrow(/instance/i);
    });
  });
  describe("register", () => {
    it("should emit error when received a constructor without injectable metadata", () => {
      const container = new Container();
      expect(() => {
        container.register(class {});
      }).toThrow(/metadata/i);
    });
    it("should emit error when no implementation token found", () => {
      const container = new Container();
      expect(() => {
        @Injectable({})
        class X {}
        container.register(X);
      }).toThrow(/token/i);
    });
    it("should emit error when registering implementation of a token more than once", () => {
      const container = new Container();
      @Injectable({ implements: dep1 })
      class A implements Dep1 {
        foo(): number {
          return 0;
        }
      }
      @Injectable({ implements: dep1 })
      class B implements Dep1 {
        foo(): number {
          return 0;
        }
      }
      container.register(A);
      expect(() => {
        container.register(B);
      }).toThrow(/twice/i);
    });
  });
  describe("resolve", () => {
    it("should resolve default implementation as instance", () => {
      const defaultImpl: Dep1 = {
        foo() {
          return 1;
        },
      };
      const dep = token<Dep1>("dep1-with-default", defaultImpl);
      const container = new Container();
      const resolved = container.resolve(dep);
      expect(resolved).toStrictEqual<Resolution>({
        circular: false,
        path: [
          {
            type: ResolveNodeType.Instance,
            instance: defaultImpl,
            token: dep,
            owner: container,
          },
        ],
      });
    });
    it("should emit error when no implementation found", () => {
      const container = new Container();
      expect(() => {
        container.resolve(dep1);
      }).toThrow(/resolve/);
    });
    it("should emit error when no metadata found on constructor", () => {
      const container = new Container();
      expect(() => {
        container.resolve(class {});
      }).toThrow(/metadata/);
    });
    it("should resolve injectable constructor", () => {
      const container = new Container();
      @Injectable({ implements: dep1 })
      class A implements Dep1 {
        foo(): number {
          return 0;
        }
      }
      container.register(A);
      const resolved = container.resolve(A);
      expect(resolved).toStrictEqual<Resolution>({
        circular: false,
        path: [
          {
            type: ResolveNodeType.Create,
            ctor: A,
            deps: [],
            owner: container,
            token: dep1,
          },
        ],
      });
    });
    it("should resolve circular dependency", () => {
      const [A, B, C] = circular();
      const container = new Container();
      container.register(A);
      container.register(B);
      container.register(C);
      const resolved = container.resolve(dep1);
      expect(resolved).toStrictEqual<Resolution>({
        circular: true,
        begin: 0,
        path: [
          {
            ctor: A,
            deps: [dep3],
            owner: container,
            token: dep1,
            type: ResolveNodeType.Create,
          },
          {
            ctor: C,
            deps: [dep2],
            owner: container,
            token: dep3,
            type: ResolveNodeType.Create,
          },
          {
            ctor: B,
            deps: [dep1],
            owner: container,
            token: dep2,
            type: ResolveNodeType.Create,
          },
          {
            ctor: A,
            deps: [dep3],
            owner: container,
            token: dep1,
            type: ResolveNodeType.Create,
          },
        ],
      });
    });
    it("should request parent container", () => {
      const parent = new Container();
      const container = new Container({ parent });
      @Injectable({ implements: dep1 })
      class A implements Dep1 {
        foo(): number {
          return 1;
        }
      }
      parent.register(A);
      expect(container.resolve(dep1)).toStrictEqual<Resolution>({
        circular: false,
        path: [
          {
            type: ResolveNodeType.Create,
            ctor: A,
            deps: [],
            owner: parent,
            token: dep1,
          },
        ],
      });
    });
  });
  describe("get", () => {
    it("should use instance cache", () => {
      const [A, B, C] = chained();
      const container = new Container();
      container.register(A);
      container.register(B);
      container.register(C);
      const dep2Impl = container.get(dep2);
      const dep3Impl = container.get(dep3);
      expect((dep3Impl as InstanceType<typeof C>).dep2).toBe(dep2Impl);
    });
    it("should reuse instance", () => {
      const [A, B, C] = reused();
      const container = new Container();
      container.register(A);
      container.register(B);
      container.register(C);
      const dep3Impl = container.get(dep3);
      expect(dep3Impl).toBeInstanceOf(C);
      expect((dep3Impl as InstanceType<typeof C>).dep1).toBe(
        ((dep3Impl as InstanceType<typeof C>).dep2 as InstanceType<typeof B>).dep1
      );
      expect(dep3Impl.baz()).toBe(true);
    });

    it("should emit error when circular dependency detected", () => {
      const [A, B, C] = circular();
      const container = new Container();
      container.register(A);
      container.register(B);
      container.register(C);
      expect(() => {
        container.get(dep1);
      }).toThrow(CircularDependencyError);
    });
  });
  describe("consume", () => {
    it("should create injectable", () => {
      const [A, B, C] = chained();
      const container = new Container();
      container.register(A);
      container.register(B);
      container.register(C);
      const dep1Impl = container.consume(A);
      expect(dep1Impl).toBeInstanceOf(A);
      const dep2Impl = container.consume(B);
      expect(dep2Impl).toBeInstanceOf(B);
      const dep3Impl = container.consume(C);
      expect(dep3Impl).toBeInstanceOf(C);
    });
    it("should create instance without dependency", () => {
      const container = new Container();
      @Injectable({})
      class A {}
      expect(container.consume(A)).toBeInstanceOf(A);
    });
  });
});

describe("CircularDependencyError", () => {
  it("should pretty print circular message", () => {
    const [A, B, C] = circular();
    const container = new Container();
    container.register(A);
    container.register(B);
    container.register(C);
    @Injectable({
      requires: [dep1],
    })
    class Consumer {}
    try {
      container.consume(Consumer);
    } catch (error) {
      expect(error instanceof CircularDependencyError && error.message).toBe(
        "Circular dependency: [Consumer] -> {{ [<dep1> A] -> [<dep3> C] -> [<dep2> B] -> [<dep1> A] }}"
      );
    }
    try {
      container.get(dep1);
    } catch (error) {
      expect(error instanceof CircularDependencyError && error.message).toBe(
        "Circular dependency: {{ [<dep1> A] -> [<dep3> C] -> [<dep2> B] -> [<dep1> A] }}"
      );
    }
  });
});

export {};
