(function(global) {
    "use strict";

    var ParameterPattern = /%([a-zA-Z_-]+)%/g,
        ContainerReferenceKeyword = 'container';

    function copy(value)
    {
        return JSON.parse(JSON.stringify(value));
    }

    function evaluate(parameter, index, collection)
    {
        var key = null,
            result = null;

        if (parameter.reference())
        {
            key = parameter.key();
            result = key === ContainerReferenceKeyword
                ? this
                : this.get(key);

            if (!result)
            {
                if (!parameter.optional())
                {
                    throw new Error('<' + key + '> not found.');
                }
                result = null;
            }
            return result;
        }
        return parameter.compute(this.parameters);
    }

    function substitute(content, hash)
    {
        var match = null,
            key = null,
            value = null,
            placeholders = [],
            i = 0,
            max = 0;

        if ('object' !== typeof(hash) || !hash)
        {
            throw new Error('The 2nd argument must be a hash');
        }

        while (match = ParameterPattern.exec(content))
        {
            key = match[1];
            value = hash[key];

            if (undefined !== value)
            {
                // Si le paramètre ne constitue qu'une unique substitution
                if (match[0] === content)
                {
                    ParameterPattern.lastIndex = 0;
                    // on renvoit directement la valeur associée
                    // -> on peut ainsi transférer autre chose que des strings
                    return value;
                }
                else
                {
                    // sinon, on collecte la valeur associée pour un remplacement ultérieur
                    placeholders.push(key, value);
                }
            }
        }

        // On remplace les valeurs collectées
        for (max = placeholders.length; i < max; i += 2)
        {
            content = content.replace(new RegExp('%' + placeholders[i] + '%', 'g'), placeholders[i + 1]);
        }
        return content;
    }

    /**
     * @class Configurator
     * @param {Function|String} callable
     * @param {String} [key] L'identifiant d'une {@link Definition|définition}.
     * @throws {Error} Lorsqu'aucun identifiant n'est fourni, le 1er argument doit être une fonction valide.
     * @throws {Error} Identifiant de définition invalide.
     * @throws {Error} Identifiant réservé utilisé.
     * @throws {Error} Le 1er argument n'est ni une fonction valide, ni le nom d'une fonction de la référence.
     * @private
     */
    function Configurator(callable, key)
    {
        if (!key)
        {
            key = null;

            if ('function' !== typeof(callable))
            {
                throw new Error('Invalid callable <' + callable + '>');
            }
        }
        else
        {
            if ('string' !== typeof(key) || '@' !== key[0])
            {
                throw new Error('Invalid reference <' + key + '>');
            }

            key = key.substr(1);
            if (!key || key === ContainerReferenceKeyword)
            {
                throw new Error('Invalid reference <' + key + '>');
            }

            if ('function' !== typeof(callable) && 'string' !== typeof(callable))
            {
                throw new Error('Invalid callable <' + callable + '>');
            }
        }

        /**
         * @member Configurator#callable
         * @type {Function|String}
         * @private
         */
        this.callable = callable;
        /**
         * @member Configurator#reference
         * @type {String}
         * @private
         */
        this.reference = key;
    }

    /**
     * Configure une instance créée par le conteneur.
     *
     * @param {Container} container
     * @param {*} instance
     * @throws {Error} Référence introuvable.
     * @throws {Error} Méthode introuvable sur la référence.
     * @function Configurator#execute
     */
    Configurator.prototype.execute = function(container, instance)
    {
        var key = this.reference,
            fn = this.callable,
            o = null,
            type = typeof(fn);

        if (null === key)
        {
            fn(instance);
        }
        else
        {
            o = container.get(key);

            if (!o)
            {
                throw new Error('<' + key + '> not found.');
            }

            if ('string' === type && undefined !== o[fn])
            {
                o[fn](instance);
            }
            else if ('function' === type)
            {
                fn.call(o, instance);
            }
            else
            {
                throw new Error('Invalid callable <' + fn + '>');
            }
        }
    };

    /**
     * @class Parameter
     * @param {*} value
     * @param {Boolean} [is_required=true] Indique si, lorsqu'il s'agit d'une référence introuvable, une exception doit être levée.
     * @private
     */
    function Parameter(value, is_required)
    {
        /**
         * @member Parameter#value
         * @type {*}
         * @private
         */
        this.value = value;
        /**
         * @member Parameter#is_required
         * @type {Boolean}
         * @default true
         * @private
         */
        this.is_required = undefined !== is_required
            ? !!is_required
            : true;
    }

    /**
     * Indique si le paramètre est optionnel. c'est à dire que s'il s'agit d'une référence et qu'elle est introuvable, aucune exception ne doit être levée.
     *
     * @returns {Boolean}
     * @function Parameter#optional
     *
     * @example
     * optional()
     */
    Parameter.prototype.optional = function()
    {
        return !this.is_required;
    };

    /**
     * Indique s'il s'agit d'une référence.
     *
     * @returns {Boolean}
     * @function Parameter#reference
     *
     * @example
     * reference()
     */
    Parameter.prototype.reference = function()
    {
        var value = this.value;

        return 'string' === typeof(value) && value && '@' === value[0];
    };

    /**
     * Retourne l'identifiant de la référence ou la valeur brute s'il s'agit d'un paramètre "normal".
     *
     * @return {*}
     * @function Parameter#key
     *
     * @example
     * key()
     */
    Parameter.prototype.key = function()
    {
        var value = this.value;

        return this.reference()
            ? value.substr(1)
            : value;
    };

    /**
     * Retourne la valeur du paramètre.
     *
     * @param {Hash<String, *>} hash La collection des paramètres définis sur le conteneur.
     * @returns {*}
     * @function Parameter#compute
     *
     * @example
     * compute({ 'name' : 'James' })
     */
    Parameter.prototype.compute = function(hash)
    {
        var result = this.value;

        if ('string' === typeof(result) && result)
        {
            return substitute(result, hash);
        }
        return result;
    };

    /**
     * Crée une nouveau conteneur.
     *
     * @class Container
     * @public
     */
    function Container()
    {
        /**
         * @member Container#definitions
         * @type {Hash<String, Definition>}
         * @private
         */
        this.definitions = {};
        /**
         * @member Container#parameters
         * @type {Hash<String, *>}
         * @private
         */
        this.parameters = {};
        /**
         * @member Container#instances
         * @type {Hash<String, *>}
         * @private
         */
        this.instances = {};
    }

    /**
     * Réinitialise le conteneur.
     *
     * @returns {Container}
     * @function Container#clear
     *
     * @example
     * clear()
     */
    Container.prototype.clear = function()
    {
        this.definitions = {};
        this.parameters = {};
        this.instances = {};
        return this;
    };

    /**
     * Supprime un singleton.
     *
     * @param {String} id
     * @returns {Boolean}
     * @function Container#destroy
     *
     * @example
     * destroy('my_component');
     */
    Container.prototype.destroy = function(id)
    {
        if (undefined === this.instances[id])
        {
            return false;
        }

        delete this.instances[id];
        return true;
    };

    /**
     * Crée une nouvelle {@link Definition|définition}.
     *
     * @param {String} id
     * @param {Function} callable
     * @param {Boolean} [singleton=true] Indique si la définition concerne un singleton.
     * @returns {Definition}
     * @throws {Error} L'identifiant doit être une chaîne non vide.
     * @throws {Error} Le 2nd argument doit être une fonction valide.
     * @throws {Error} L'identifiant ne peut pas valoir "container" car c'est un mot réservé.
     * @function Container#register
     *
     * @example
     * register('my_component', ComponentConstructor)
     *
     * @example
     * register('my_component', ComponentConstructor, false)
     *
     * @example
     * register('my_component', function InlineFactory() {
     *  return {
     *    execute: function() {}
     *  };
     * })
     */
    Container.prototype.register = function(id, callable, singleton)
    {
        if (!id || 'string' !== typeof(id))
        {
            throw new Error('The 1st argument must be a non-empty string');
        }
        else if ('function' !== typeof(callable))
        {
            throw new Error('The 2nd argument must be a valid callable');
        }
        else if (id === ContainerReferenceKeyword)
        {
            throw new Error('<' + ContainerReferenceKeyword + '> is a reserved keyword');
        }
        else if (undefined !== this.definitions[id])
        {
            console.warn('<' + id + '> is already registered');
        }

        var definition = {
            callable: callable,
            singleton: undefined !== singleton ? !!singleton : true,
            args: [],
            calls: [],
            configs: []
        };

        this.definitions[id] = definition;

        /**
         * @class Definition
         * @private
         */
        return {
            /**
             * Ajoute un argument qui sera transmis lors de la création d'une nouvelle instance.
             *
             * @param {*} value
             * @param {Boolean} [is_required=true] Indique si, lorsqu'il s'agit d'une référence introuvable, une exception doit être levée.
             * @returns {Definition}
             * @function Definition#argument
             *
             * @example
             * argument(123)
             *
             * @example
             * argument('%username%')
             *
             * @example
             * argument([1, 5, 10])
             *
             * @example
             * argument('@reference', false)
             */
            argument: function(value, is_required)
            {
                definition.args.push(new Parameter(value, is_required));
                return this;
            },

            /**
             * Ajoute la description d'un appel de méthode post-configuration.
             *
             * @param {Function} fn
             * @param {*} [...arg]
             * @returns {Definition}
             * @throws {Error} Le 1er argument doit être une fonction valide.
             * @function Definition#method
             *
             * @example
             * method(Rocket.prototype.ignition, '%secret_code%')
             */
            method: function(fn)
            {
                var i = 1,
                    max = arguments.length,
                    args = null;

                if ('function' !== typeof(fn))
                {
                    throw new Error('The 1st argument must be a valid callable');
                }

                args = [fn];

                for (; i < max; ++i)
                {
                    args.push(new Parameter(arguments[i], true));
                }
                definition.calls.push(args);
                return this;
            },

            /**
             * Ajoute la description d'un appel à un configurateur post-instanciation.
             *
             * @returns {Definition}
             * @throws {Error}
             * @function Definition#configure
             *
             * @example
             * configure('@reference', 'setupInstance')
             *
             * @example
             * configure('@reference', MyConfigurator.prototype.setupInstance)
             *
             * @example
             * configure(function MyConfigurator(instance) {
             *  instance.setup();
             * });
             */
            configure: function(fn)
            {
                switch (arguments.length)
                {
                    case 1:
                        definition.configs.push(new Configurator(arguments[0]));
                        break;
                    case 2:
                        definition.configs.push(new Configurator(arguments[1], arguments[0]));
                        break;
                    default:
                        throw new Error('Invalid configurator');
                        break;
                }
                return this;
            }
        };
    };

    /**
     * Définit un paramètre utilisable pour les appels aux méthodes {@link Definition#argument|argument} & {@link Definition#method|method} des {@link Definition|définitions}.
     * Afin d'éviter toutes modifications en dehors du conteneur, la valeur est copiée.
     *
     * @param {String} key
     * @param {*} value
     * @returns {Container}
     * @function Container#set
     *
     * @example
     * set('username', 'James')
     *
     * @example
     * set('scores', [1, 5, 10])
     */
    Container.prototype.set = function(key, value)
    {
        this.parameters[key] = copy(value);
        return this;
    };

    /**
     * Retourne une instance pour la {@link Definition|définition} demandée.
     * S'il s'agit de la définition d'un singleton et qu'aucune instance n'existe, elle est créée, configurée, puis stockée.
     * Dans le cas contraire, une nouvelle instance est toujours créée et configurée.
     *
     * A noter que les paramètres additionnels sont transmis après les paramètres définis par la définition.
     *
     * @param {String} id
     * @param {*} [...ctor_arg] Paramètres additionnels transmis lors de la création d'une nouvelle instance
     * @returns {Object}
     * @throws {Error}
     * @function Container#get
     *
     * @example
     * get('my_component')
     *
     * @example
     * get('my_component', 123)
     */
    Container.prototype.get = function(id)
    {
        var result = null,
            instance = null,
            definition = this.definitions[id],
            args = Array.prototype.slice.call(arguments, 1).map(copy),
            i = 0,
            max = 0;

        if (definition)
        {
            if (definition.singleton)
            {
                result = this.instances[id] || null;
            }

            // Si aucune instance n'a été conservée
            if (!result)
            {
                // On en crée une nouvelle
                instance = Object.create(definition.callable.prototype);
                // On construit le tableau des paramètres du constructeur
                args = definition.args.map(evaluate, this).concat(args);
                // On appelle le constructeur
                result = definition.callable.apply(instance, args);
                // S'il n'a pas retourné un nouvel objet
                if (!result)
                {
                    // alors il s'agit toujours de la même instance
                    result = instance;
                }

                // On appelle les fonctions de configuration
                for (i = 0, max = definition.configs.length; i < max; ++i)
                {
                    definition.configs[i].execute(this, result);
                }

                // On appelle les fonctions post-configuration
                for (i = 0, max = definition.calls.length; i < max; ++i)
                {
                    definition.calls[i][0].apply(result, definition.calls[i].slice(1).map(evaluate, this));
                }

                // Et s'il s'agit d'un singleton
                if (definition.singleton)
                {
                    // On le stocke pour plus tard
                    this.instances[id] = result;
                }
            }
        }
        return result;
    };

    // exports to multiple environments
    if(typeof define === 'function' && define.amd) // AMD
    {
        define(Container);
    }
    else if (typeof module !== 'undefined' && module.exports) // node
    {
        module.exports = Container;
    }
    else // browser
    {
        // use string because of Google closure compiler ADVANCED_MODE
        global['Container'] = Container;
    }

})(this);