import {
  Layout,
  Page,
  Text,
  Card,
  ResourceList,
  ResourceItem,
  Thumbnail,
  Button,
  Modal,
  Checkbox,
  Collapsible,
  Toast,
  Frame,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { json } from "@remix-run/node";
import { useState, useCallback, useEffect } from "react";

// Loader function to fetch products and collections from Shopify
export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  // Fetch products from Shopify
  const productsResponse = await admin.graphql(`
    query fetchProducts {
      products(first: 10) {
        edges {
          node {
            id
            title
            descriptionHtml
            handle
            images(first: 1) {
              edges {
                node {
                  originalSrc
                  altText
                }
              }
            }
            variants(first: 1) {
              edges {
                node {
                  price
                }
              }
            }
          }
        }
      }
    }
  `);

  const productsResponseBody = await productsResponse.json();

  // Fetch collections from Shopify
  const collectionsResponse = await admin.graphql(`
    query fetchCollections {
      collections(first: 10) {
        edges {
          node {
            id
            title
            handle
            products(first: 10) {
              edges {
                node {
                  id
                  title
                  images(first: 1) {
                    edges {
                      node {
                        originalSrc
                        altText
                      }
                    }
                  }
                  variants(first: 1) {
                    edges {
                      node {
                        price
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `);

  const collectionsResponseBody = await collectionsResponse.json();

  const addedProductsResponse = await fetch('http://localhost:3000/getProducts');

  const allProducts = await addedProductsResponse.json();

  const addedProductIds = allProducts.map(product => product.productId) || []; 

  // Fetch product details for added product IDs
  const productDetailsResponse = await admin.graphql(`
    query fetchProductDetails($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on Product {
          id
          title
          descriptionHtml
          images(first: 1) {
            edges {
              node {
                originalSrc
                altText
              }
            }
          }
          variants(first: 100) {
            edges {
              node {
               id
              title 
              price
              }
            }
          }
        }
      }
    }
  `, {
    variables: { ids: addedProductIds }
  });

  const productDetailsResponseBody = await productDetailsResponse.json();

  const productData = productDetailsResponseBody.data.nodes.map(product => ( console.log("productSdata",product.variants.edges), {


    id: product.id,
    title: product.title,
    description: product.descriptionHtml,
    image: product.images.edges[0]?.node.originalSrc,
    price: product.variants.edges[0]?.node.price,
    variants: product.variants.edges.map(variant => ({
      id: variant.node.id,
      varaint_title: variant.node.title,  // Store the variant name
      price: variant.node.price,
    }))
  }));
  console.log("productData",productData)

  const productDataString = JSON.stringify(productData).replace(/"/g, '\\"');

  const response = await admin.graphql(`
    query {
        shop {
            id
            name
            email
            myshopifyDomain
        }
    }
`);

const responseBody = await response.json();
const shopData = responseBody.data.shop;

console.log("shopData.id",shopData.id)  



// const mutation = `
//   mutation {
//     metafieldsSet(
//       metafields: [
//         {
//           namespace: "your_namespace"
//           key: "shop_product_details"
//           value: "${productDataString}"
//           type: "json"
//           ownerId: "${shopData.id}"
//         }
//       ]) {
//       metafields {
//         id
//       }
//       userErrors {
//         field
//         message
//       }
//     }
//   }
// `;

// Log the mutation for debugging
// console.log(mutation,"mutaionData");

// const mutationResponse = await admin.graphql(mutation);

const metafieldUpdateResponse = await admin.graphql(`
  mutation {
      metafieldsSet(metafields: [
          {
              ownerId: "${shopData.id}",  
              namespace: "your_namespace",
              key: "shop_product_details",
              value: "${productDataString}",
              type: "json"
          }
      ]) {
          metafields {
              id
          }
      }
  }
`);

console.log("metafieldUpdateResponse",metafieldUpdateResponse)
// Check for any user errors
if (metafieldUpdateResponse.data?.metafieldsSet.userErrors.length > 0) {
  console.error("User Errors:", metafieldUpdateResponse.data.metafieldsSet.userErrors);
} else {
  console.log("Metafields updated successfully!");
}



  return json({
    products: productsResponseBody.data.products.edges,
    collections: collectionsResponseBody.data.collections.edges,
    addedProducts: allProducts.map(product => product.productId) || []  // Array of product IDs
  });
};

// Server-side action to handle the product and metafield saving
export const action = async ({ request }) => {
  console.log("gettthrer")
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();

  
  try {
    console.log ("formData",formData)
    const products = formData.get('products'); // Get the products value
    const productArray = products ? products.split(',') : [];
    console.log("productArray:", productArray);

    const response = await fetch("http://localhost:3000/addProduct", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ products: productArray }),
    });

    for (const productId of productArray) {
      const productDetails = await admin.graphql(`{
        product(id: "${productId}") {
          title
          variants(first: 1) {
            edges {
              node {
                price
              }
            }
          }
        }
      }`);
    
      const { title, variants } = productDetails.data.product;
      const price = variants.edges[0]?.node.price;
    
      // const metafieldMutation = await admin.graphql(`
      //   mutation createMetafield {
      //     productUpdate(input: {
      //       id: "${productId}",
      //       metafields: [
      //         {
      //           namespace: "custom_namespace",
      //           key: "product_title",
      //           type: "single_line_text_field",
      //           value: "${title}"
      //         },
      //         {
      //           namespace: "custom_namespace",
      //           key: "product_price",
      //           type: "single_line_text_field",
      //           value: "${price}"
      //         }
      //       ]
      //     }) {
      //       product {
      //         id
      //       }
      //       userErrors {
      //         field
      //         message
      //       }
      //     }
      //   }
      // `);
      
      // Handle errors...
    }
    

    // if (!response.ok) {
    //   throw new Error("Failed to save products to external API.");
    // }
    return json({ success: true });
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};


// Component to display products and collections
export default function Products() {
  const { products, collections, addedProducts ,admin } = useLoaderData();
  const [active, setActive] = useState(false);
  const [showCollections, setShowCollections] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [selectedCollections, setSelectedCollections] = useState([]);
  const [expandedCollections, setExpandedCollections] = useState([]);
  const [showToast, setShowToast] = useState(false); // Toast state
  const [updatedProducts, setUpdatedProducts] = useState(addedProducts);
  const fetcher = useFetcher();
  
  useEffect(() => {
    if (fetcher.data && fetcher.data.addedProducts) {
      setUpdatedProducts(fetcher.data.addedProducts);
    }
  }, [fetcher.data]);

  // Toggle modal visibility
  const handleToggle = useCallback(() => {
    setActive(!active);
    if (active) {
      setShowCollections(false); // Ensure collections modal is not shown when products modal is open
    }
  }, [active]);

  // Toggle between products and collections
  const handleToggleCollections = useCallback(() => {
    setShowCollections(!showCollections);
  }, [showCollections]);

  // Handle collection selection
  const handleCollectionCheckboxChange = useCallback(
    (id) => {
      const productsInCollection = getProductsFromSelectedCollections(id);
      if (selectedCollections.includes(id)) {
        // Unselecting the collection
        setSelectedProducts((prevProducts) =>
          prevProducts.filter((productId) =>
            !productsInCollection.map((product) => product.id).includes(productId)
          )
        );
        setSelectedCollections((prevSelected) =>
          prevSelected.filter((collectionId) => collectionId !== id)
        );
      } else {
        // Selecting the collection
        setSelectedCollections((prevSelected) => [...prevSelected, id]);
        setSelectedProducts((prevSelected) => [
          ...prevSelected,
          ...productsInCollection.map((product) => product.id),
        ]);
      }
    },
    [selectedCollections, selectedProducts]
  );

  // Handle product selection
  const handleCheckboxChange = useCallback(
    (id) => {
      setSelectedProducts((prevSelected) =>
        prevSelected.includes(id)
          ? prevSelected.filter((productId) => productId !== id)
          : [...prevSelected, id]
      );
    },
    [selectedProducts]
  );

  // Handle adding selected products to database
  // Handle adding selected products to database
// Handle adding selected products to database
const handleAddToDatabase = useCallback(async () => {
  try {
    const response = await fetcher.submit(
      { products: selectedProducts.join(',') }, // Join multiple IDs with a comma or another delimiter
      { method: "post" } // Call the current route's action (no need to specify the URL)
    );

    // Check if the response is OK
    if (!response.ok) {
      throw new Error(`Error: ${response.statusText}`);
    }

    setActive(false);  // Close modal
    setSelectedProducts([]);  // Clear selected products
    setShowToast(true);  // Show confirmation message

  } catch (error) {
    console.error("Error saving products and metafields:", error);
  }
}, [selectedProducts, fetcher]);



  // Function to save product data to Shopify Metafields
// Function to save product data to Shopify Metafields


  // Toggle expansion of a collection
  const handleToggleCollectionExpansion = useCallback((id) => {
    setExpandedCollections((prevExpanded) =>
      prevExpanded.includes(id)
        ? prevExpanded.filter((collectionId) => collectionId !== id)
        : [...prevExpanded, id]
    );
  }, []);

  // Get products of selected collections
  const getProductsFromSelectedCollections = (collectionId) => {
    const collection = collections.find((collection) => collection.node.id === collectionId);
    return collection ? collection.node.products.edges.map((product) => product.node) : [];
  };

  // Determine if a collection checkbox should be checked based on its products
  const isCollectionChecked = (collectionId) => {
    const productsInCollection = getProductsFromSelectedCollections(collectionId);
    return productsInCollection.every((product) => selectedProducts.includes(product.id));
  };

  return (
    <Frame>
    <Page title="Products">
      <Layout>
        <Layout.Section>
          <Card sectioned>
            <Button onClick={() => { setActive(true); setShowCollections(false); }}>Browse Products</Button>
            <Button onClick={() => { setActive(true); setShowCollections(true); }}>Browse Collections</Button>

            {/* Modal for product browsing */}
            <Modal
              open={active && !showCollections}
              onClose={() => { setActive(false); setShowCollections(false); }}
              title="Browse Products"
              primaryAction={{
                content: "Add to Database",
                onAction: handleAddToDatabase,
              }}
              secondaryActions={[
                {
                  content: "Close",
                  onAction: () => { setActive(false); setShowCollections(false); },
                },
              ]}
              large
            >
              <Modal.Section>
                <ResourceList
                  resourceName={{ singular: "product", plural: "products" }}
                  items={products}
                  renderItem={(item) => {
                    const { id, title, images, variants } = item.node;
                    const media = (
                      <Thumbnail
                        source={images.edges[0]?.node.originalSrc || ""}
                        alt={images.edges[0]?.node.altText || ""}
                      />
                    );

                    // Check if product is already added to the database
                    const isAdded = addedProducts.includes(id);

                    return (
                      <ResourceItem
                        id={id}
                        media={media}
                        accessibilityLabel={`View details for ${title}`}
                      >
                        <Checkbox
                          label={
                            <span>
                              <h3>
                                <Text variant="bodyMd" fontWeight="bold">
                                  {title}
                                </Text>
                              </h3>
                              <div>{variants.edges[0]?.node.price} USD</div>
                            </span>
                          }
                          checked={isAdded || selectedProducts.includes(id)}
                          onChange={() => handleCheckboxChange(id)}
                          disabled={isAdded} // Disable if already added
                        />
                      </ResourceItem>
                    );
                  }}
                />
              </Modal.Section>
            </Modal>

            {/* Modal for collection browsing */}
            <Modal
              open={active && showCollections}
              onClose={() => { setActive(false); setShowCollections(false); }}
              title="Browse Collections"
              secondaryActions={[
                {
                  content: "Close",
                  onAction: () => { setActive(false); setShowCollections(false); },
                },
              ]}
              large
            >
              <Modal.Section>
                <ResourceList
                  resourceName={{ singular: "collection", plural: "collections" }}
                  items={collections}
                  renderItem={(item) => {
                    const { id, title, images } = item.node;
                    return (
                      <ResourceItem
                        id={id}
                        accessibilityLabel={`View details for ${title}`}
                        onClick={() => handleToggleCollectionExpansion(id)}
                      >
                        <Checkbox
                          label={
                            <span>
                              <h3>
                                <Text variant="bodyMd" fontWeight="bold">
                                  {title}
                                </Text>
                              </h3>
                            </span>
                          }
                          checked={isCollectionChecked(id)}
                          onChange={() => handleCollectionCheckboxChange(id)}
                        />

                        {/* Show products of the collection if expanded */}
                        <Collapsible open={expandedCollections.includes(id)}>
                          <ResourceList
                            resourceName={{ singular: "product", plural: "products" }}
                            items={getProductsFromSelectedCollections(id)}
                            renderItem={(productItem) => {
                              const { id, title, images, variants } = productItem;
                              const media = (
                                <Thumbnail
                                  source={images.edges[0]?.node.originalSrc || ""}
                                  alt={images.edges[0]?.node.altText || ""}
                                />
                              );

                              return (
                                <ResourceItem
                                  id={id}
                                  media={media}
                                  accessibilityLabel={`View details for ${title}`}
                                >
                                  <Checkbox
                                    label={
                                      <span>
                                        <h3>
                                          <Text variant="bodyMd" fontWeight="bold">
                                            {title}
                                          </Text>
                                        </h3>
                                        <div>{variants.edges[0]?.node.price} USD</div>
                                      </span>
                                    }
                                    checked={selectedProducts.includes(id)}
                                    onChange={() => handleCheckboxChange(id)}
                                  />
                                </ResourceItem>
                              );
                            }}
                          />
                        </Collapsible>
                      </ResourceItem>
                    );
                  }}
                />
              </Modal.Section>
            </Modal>
          </Card>

          {/* Display already added products */}
          {/* // Display already added products */}
          {updatedProducts.length > 0 && (
  <Card title="Already Added Products" sectioned>
    <ResourceList
      resourceName={{ singular: "product", plural: "products" }}
      items={products.filter((product) => updatedProducts.includes(product.node.id))}
      renderItem={(item) => {
        const { title, images, variants } = item.node;
        const media = (
          <Thumbnail
            source={images.edges[0]?.node.originalSrc || ""}
            alt={images.edges[0]?.node.altText || ""}
          />
        );
        return (
          <ResourceItem
            id={item.node.id}
            media={media}
            accessibilityLabel={`View details for ${title}`}
          >
            <h3>
              <Text variant="bodyMd" fontWeight="bold">
                {title}
              </Text>
            </h3>
            <div>{variants.edges[0]?.node.price} USD</div>
          </ResourceItem>
        );
      }}
    />
  </Card>
)}


        </Layout.Section>
      </Layout>
       {/* Toast notification */}
       {showToast && (
          <Toast
            content="Product added successfully"
            onDismiss={() => setShowToast(false)}
          />
        )}
    </Page>
    </Frame>
  );
}
