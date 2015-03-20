(function(global) {
    "use strict";

    var ParameterPattern = /%([a-zA-Z_-]+)%/g,
        ContainerReferenceKeyword = 'container';

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
        return parameter.value(this.parameters);
    }

    function substitute(content, hash)
    {
        var match = null,
            key = null,
            value = null,
            placeholders = [],
            i = 0,
            max = 0;

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
     * @param {Function|String} callable .
     * @param {String} [key] L'identifiant d'une définition.
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

        this.callable_ = callable;
        this.reference_ = key;
    }

    /**
     * Configure une instance créée par le conteneur.
     *
     * @param {Container} container .
     * @param {*} instance .
     * @throws {Error} Référence introuvable.
     * @throws {Error} Méthode introuvable sur la référence.
     */
    Configurator.prototype.execute = function(container, instance)
    {
        var key = this.reference_,
            fn = this.callable_,
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
     * @param {*} value .
     * @param {Boolean} [is_required=true] Indique si, lorsqu'il s'agit d'une référence introuvable, une exception doit être levée.
     * @private
     */
    function Parameter(value, is_required)
    {
        this.value_ = value;
        this.is_required_ = undefined !== is_required
            ? !!is_required
            : true;
    }

    /**
     * Indique si le paramètre est optionnel. c'est à dire que s'il s'agit d'une référence et qu'elle est introuvable, aucune exception ne doit être levée.
     *
     * @returns {Boolean} .
     */
    Parameter.prototype.optional = function()
    {
        return !this.is_required_;
    };

    /**
     * Indique s'il s'agit d'une référence.
     *
     * @returns {Boolean} .
     */
    Parameter.prototype.reference = function()
    {
        var value = this.value_;

        return 'string' === typeof(value) && value && '@' === value[0];
    };

    /**
     * Retourne l'identifiant de la référence ou la valeur brute s'il s'agit d'un paramètre "normal".
     *
     * @return {*} .
     */
    Parameter.prototype.key = function()
    {
        var value = this.value_;

        return this.reference()
            ? value.substr(1)
            : value;
    };

    /**
     * Retourne la valeur du paramètre.
     *
     * @param {Object} hash La collection des paramètres définis sur le conteneur.
     * @returns {*} .
     */
    Parameter.prototype.value = function(hash)
    {
        var result = this.value_;

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
        this.definitions = {};
        this.parameters = {};
        this.instances = {};
    }

    /**
     * Réinitialise le conteneur.
     *
     * @returns {Container} .
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
     * @param {String} id .
     * @returns {Boolean} .
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
     * Crée une nouvelle définition.
     *
     * @param {String} id .
     * @param {Function} callable .
     * @param {Boolean} [singleton=true] Indique si la définition concerne un singleton.
     * @returns {Definition} .
     * @throws {Error} L'identifiant doit être une chaîne non vide.
     * @throws {Error} Le 2nd argument doit être une fonction valide.
     * @throws {Error} L'identifiant ne peut pas valoir "container" car c'est un mot réservé.
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
         * @inner
         * @public
         */
        return {
            /**
             * Ajoute un argument qui sera transmis lors de la création d'une nouvelle instance.
             *
             * @param {*} value .
             * @param {Boolean} [is_required=true] Indique si, lorsqu'il s'agit d'une référence introuvable, une exception doit être levée.
             * @returns {Definition} .
             */
            argument: function(value, is_required)
            {
                definition.args.push(new Parameter(value, is_required));
                return this;
            },

            /**
             * Ajoute la description d'un appel de méthode post-configuration.
             *
             * @param {Function} fn .
             * @param {*} ...arg .
             * @returns {Definition} .
             * @throws {Error} Le 1er argument doit être une fonction valide.
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
             * @returns {Definition} .
             * @throws {Error} .
             *
             * @example configure('@reference', 'setupInstance')
             *
             * @example configure('@reference', Service.prototype.setupInstance)
             *
             * @example configure(function MyConfigurator(instance) {
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
     * Définit un paramètre utilisable pour les appels aux méthodes "argument" & "method" des définitions.
     * S'il s'agit d'un objet, il est copié afin d'éviter toutes modifications en dehors du conteneur.
     *
     * @param {String} key .
     * @param {*} value .
     * @returns {Container} .
     */
    Container.prototype.set = function(key, value)
    {
        this.parameters[key] = ('object' === typeof(value) && null !== value)
            ? Object.create(value)
            : value;
        return this;
    };

    /**
     * Retourne une instance pour la définition demandée.
     * S'il s'agit de la définition d'un singleton et qu'aucune instance n'existe, elle est créée, configurée, puis stockée.
     * Dans le cas contraire, une nouvelle instance est toujours créée & configurée.
     *
     * @param {String} id .
     * @returns {Object} .
     * @throws {Error} .
     */
    Container.prototype.get = function(id)
    {
        var result = null,
            instance = null,
            definition = this.definitions[id],
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
                // On appelle le constructeur
                result = definition.callable.apply(instance, definition.args.map(evaluate, this));
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