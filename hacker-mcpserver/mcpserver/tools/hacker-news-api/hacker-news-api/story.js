/**
 * Function to retrieve a story from Hacker News by its ID.
 *
 * @param {Object} args - Arguments for the story retrieval.
 * @param {number} args.itemId - The unique ID of the story to retrieve.
 * @returns {Promise<Object>} - The story data retrieved from Hacker News.
 */
const executeFunction = async ({ itemId }) => {
  const baseUrl = 'https://hacker-news.firebaseio.com/v0';
  try {
    // Construct the URL for fetching the story
    const url = `${baseUrl}/item/${itemId}.json?print=pretty`;

    // Perform the fetch request
    const response = await fetch(url, {
      method: 'GET'
    });

    // Check if the response was successful
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(JSON.stringify(errorData));
    }

    // Parse and return the response data
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error retrieving story:', error);
    return {
      error: `An error occurred while retrieving the story: ${error instanceof Error ? error.message : JSON.stringify(error)}`
    };
  }
};

/**
 * Tool configuration for retrieving a story from Hacker News.
 * @type {Object}
 */
const apiTool = {
  function: executeFunction,
  definition: {
    type: 'function',
    function: {
      name: 'get_story',
      description: 'Retrieve a story from Hacker News by its ID.',
      parameters: {
        type: 'object',
        properties: {
          itemId: {
            type: 'integer',
            description: 'The unique ID of the story to retrieve.'
          }
        },
        required: ['itemId']
      }
    }
  }
};

export { apiTool };